/**
 * Record_Manager
 * Route53 APIを使用したDNSレコードの登録・削除・ロールバック・同期確認を担当する
 */

import {
  Route53Client,
  ChangeResourceRecordSetsCommand,
  ListResourceRecordSetsCommand,
  GetChangeCommand,
} from '@aws-sdk/client-route-53';
import type { Config, DnsRecord, GeneratedRecords, RegistrationResult } from './types';

/** ChangeBatchのChange構造を組み立てるヘルパー */
function buildChangeBatch(
  records: DnsRecord[],
  action: 'CREATE' | 'UPSERT' | 'DELETE',
  comment: string
) {
  return {
    Comment: comment,
    Changes: records.map((r) => ({
      Action: action,
      ResourceRecordSet: {
        Name: r.name,
        Type: r.type,
        TTL: r.ttl,
        ResourceRecords: [{ Value: r.value }],
      },
    })),
  };
}

export class RecordManager {
  constructor(private route53Client: Route53Client) {}

  /** 同一店舗コードのレコードが既に存在するか確認する */
  async checkDuplicateShopCode(shopCode: string, zoneId: string): Promise<boolean> {
    // 店舗コード配下のレコード位置からスキャン開始（例: "s1105.yamaokaya.net"）
    const command = new ListResourceRecordSetsCommand({
      HostedZoneId: zoneId,
      StartRecordName: `${shopCode}.yamaokaya.net`,
    });
    const response = await this.route53Client.send(command);
    const suffix = `.${shopCode}.yamaokaya.net.`;
    return (response.ResourceRecordSets ?? []).some((rrs) =>
      rrs.Name?.endsWith(suffix)
    );
  }

  /**
   * 指定されたCNAMEレコードが既に存在するか確認する
   * @param recordName 確認対象のFQDN（例: "rt.s001.yamaokaya.net"）
   * @param zoneId ホストゾーンID
   * @returns 存在する場合 true
   */
  async checkDuplicateCname(recordName: string, zoneId: string): Promise<boolean> {
    const command = new ListResourceRecordSetsCommand({
      HostedZoneId: zoneId,
      StartRecordName: recordName,
    });
    const response = await this.route53Client.send(command);
    const normalizedName = recordName.replace(/\.$/, '');
    return (response.ResourceRecordSets ?? []).some(
      (rrs) =>
        rrs.Type === 'CNAME' &&
        rrs.Name?.replace(/\.$/, '') === normalizedName
    );
  }

  /**
   * 指定されたTXTレコードが既に存在するか確認する
   * @param recordName 確認対象のFQDN（例: "s001.yamaokaya.net"）
   * @param zoneId ホストゾーンID
   * @returns 存在する場合 true
   */
  async checkDuplicateTxt(recordName: string, zoneId: string): Promise<boolean> {
    const command = new ListResourceRecordSetsCommand({
      HostedZoneId: zoneId,
      StartRecordName: recordName,
    });
    const response = await this.route53Client.send(command);
    const normalizedName = recordName.replace(/\.$/, '');
    return (response.ResourceRecordSets ?? []).some(
      (rrs) =>
        rrs.Type === 'TXT' &&
        rrs.Name?.replace(/\.$/, '') === normalizedName
    );
  }

  /** レコード登録（yamaokaya.net → internal.menkata.me の順序） */
  async registerRecords(
    records: GeneratedRecords,
    config: Config,
    testMode?: boolean
  ): Promise<RegistrationResult> {
    const action = testMode ? 'UPSERT' : 'CREATE';
    const totalCount =
      records.yamaokayaARecords.length +
      records.yamaokayaCnameAliases.length +
      records.menkataCnameRecords.length;

    try {
      // yamaokaya.net ゾーンに登録（AレコードとCNAMEエイリアスを1つのChangeBatchで）
      console.error('yamaokaya.net ゾーンにレコードを登録中...');
      const yamaokayaRecords = [
        ...records.yamaokayaARecords,
        ...records.yamaokayaCnameAliases,
      ];
      const yamaokayaCommand = new ChangeResourceRecordSetsCommand({
        HostedZoneId: config.yamaokayaZoneId,
        ChangeBatch: buildChangeBatch(yamaokayaRecords, action, 'DNS Auto Register: yamaokaya.net'),
      });
      const yamaokayaResult = await this.route53Client.send(yamaokayaCommand);
      const yamaokayaChangeId = yamaokayaResult.ChangeInfo?.Id ?? '';
      console.error('yamaokaya.net ゾーンへの登録が完了しました。');

      // internal.menkata.me ゾーンに登録
      console.error('internal.menkata.me ゾーンにレコードを登録中...');
      let menkataChangeId: string;
      try {
        const menkataCommand = new ChangeResourceRecordSetsCommand({
          HostedZoneId: config.menkataZoneId,
          ChangeBatch: buildChangeBatch(
            records.menkataCnameRecords,
            action,
            'DNS Auto Register: internal.menkata.me'
          ),
        });
        const menkataResult = await this.route53Client.send(menkataCommand);
        menkataChangeId = menkataResult.ChangeInfo?.Id ?? '';
      } catch (error) {
        // menkata登録失敗時はyamaokayaをロールバック
        await this.rollbackYamaokaya(yamaokayaRecords, config.yamaokayaZoneId);
        return {
          success: false,
          recordCount: 0,
          error: '登録処理の途中でエラーが発生したため、登録済みのレコードをすべて取り消しました。レコードは登録されていません。',
        };
      }

      return {
        success: true,
        yamaokayaChangeId,
        menkataChangeId,
        recordCount: totalCount,
      };
    } catch (error) {
      return {
        success: false,
        recordCount: 0,
        error: `レコードの登録に失敗しました。レコードは登録されていません。IT部門に連絡してください。`,
      };
    }
  }

  /** yamaokaya.net ゾーンのレコードをロールバック（削除） */
  async rollbackYamaokaya(records: DnsRecord[], zoneId: string): Promise<void> {
    try {
      console.error('yamaokaya.net ゾーンのレコードをロールバック中...');
      const command = new ChangeResourceRecordSetsCommand({
        HostedZoneId: zoneId,
        ChangeBatch: buildChangeBatch(records, 'DELETE', 'DNS Auto Register: ロールバック'),
      });
      await this.route53Client.send(command);
      console.error('登録処理の途中でエラーが発生したため、登録済みのレコードをすべて取り消しました。レコードは登録されていません。');
    } catch (rollbackError) {
      console.error('レコードの取り消しに失敗しました。至急IT部門に連絡してください。');
      throw rollbackError;
    }
  }

  /** GetChange ポーリングでINSYNC確認（タイムアウト5分） */
  async waitForSync(changeId: string, timeoutMs: number = 300000): Promise<boolean> {
    const interval = 5000;
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      const command = new GetChangeCommand({ Id: changeId });
      const response = await this.route53Client.send(command);
      if (response.ChangeInfo?.Status === 'INSYNC') {
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
    return false;
  }

  /** レコード削除（undo用、両ゾーン） */
  async deleteRecords(records: GeneratedRecords, config: Config): Promise<void> {
    // yamaokaya.net ゾーンから削除
    console.error('yamaokaya.net ゾーンのレコードを削除中...');
    const yamaokayaRecords = [
      ...records.yamaokayaARecords,
      ...records.yamaokayaCnameAliases,
    ];
    const yamaokayaCommand = new ChangeResourceRecordSetsCommand({
      HostedZoneId: config.yamaokayaZoneId,
      ChangeBatch: buildChangeBatch(yamaokayaRecords, 'DELETE', 'DNS Auto Register: undo削除'),
    });
    await this.route53Client.send(yamaokayaCommand);

    // internal.menkata.me ゾーンから削除
    console.error('internal.menkata.me ゾーンのレコードを削除中...');
    const menkataCommand = new ChangeResourceRecordSetsCommand({
      HostedZoneId: config.menkataZoneId,
      ChangeBatch: buildChangeBatch(records.menkataCnameRecords, 'DELETE', 'DNS Auto Register: undo削除'),
    });
    await this.route53Client.send(menkataCommand);
  }
}
