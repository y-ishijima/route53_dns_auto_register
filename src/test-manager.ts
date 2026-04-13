/**
 * Test_Record_Manager
 * テストレコード（__dns_auto_test- プレフィックス付き）の一覧取得・一括削除を担当する
 */

import {
  Route53Client,
  ChangeResourceRecordSetsCommand,
  ListResourceRecordSetsCommand,
  type RRType,
} from '@aws-sdk/client-route-53';
import type { Config, DnsRecord } from './types';

export class TestRecordManager {
  constructor(private route53Client: Route53Client) {}

  /** テストレコード識別用プレフィックス */
  static readonly TEST_PREFIX = '__dns_auto_test-';

  /** 指定ゾーンのテストレコード一覧を取得する */
  async listTestRecords(zoneId: string): Promise<DnsRecord[]> {
    const records: DnsRecord[] = [];
    let nextName: string | undefined;
    let nextType: RRType | undefined;

    do {
      const command = new ListResourceRecordSetsCommand({
        HostedZoneId: zoneId,
        ...(nextName && { StartRecordName: nextName }),
        ...(nextType && { StartRecordType: nextType }),
      });
      const response = await this.route53Client.send(command);

      for (const rrs of response.ResourceRecordSets ?? []) {
        const name = rrs.Name ?? '';
        // Route53はFQDN末尾にドットを付与するため、除去して判定
        const cleanName = name.endsWith('.') ? name.slice(0, -1) : name;

        if (cleanName.startsWith(TestRecordManager.TEST_PREFIX)) {
          for (const rr of rrs.ResourceRecords ?? []) {
            records.push({
              name: cleanName,
              type: rrs.Type as 'A' | 'CNAME' | 'TXT',
              value: rr.Value ?? '',
              ttl: rrs.TTL ?? 300,
            });
          }
        }
      }

      if (response.IsTruncated) {
        nextName = response.NextRecordName;
        nextType = response.NextRecordType as RRType | undefined;
      } else {
        nextName = undefined;
        nextType = undefined;
      }
    } while (nextName);

    return records;
  }

  /** 両ゾーンのテストレコードを一括削除する（事前取得済みレコードを受け取る） */
  async deleteAllTestRecords(
    records: { yamaokayaRecords: DnsRecord[]; menkataRecords: DnsRecord[] },
    config: Config
  ): Promise<{
    deletedCount: number;
    failedCount: number;
    failures: Array<{ name: string; reason: string }>;
  }> {
    // 事前取得済みレコードを使用（内部での再取得を排除）
    const { yamaokayaRecords, menkataRecords } = records;

    if (yamaokayaRecords.length === 0 && menkataRecords.length === 0) {
      console.log('削除対象のテストレコードが見つかりません。');
      return { deletedCount: 0, failedCount: 0, failures: [] };
    }

    console.log('テストレコードを削除中...');
    let deletedCount = 0;
    const failures: Array<{ name: string; reason: string }> = [];

    // 各ゾーンのテストレコードを削除
    const zones: Array<{ zoneId: string; records: DnsRecord[] }> = [
      { zoneId: config.yamaokayaZoneId, records: yamaokayaRecords },
      { zoneId: config.menkataZoneId, records: menkataRecords },
    ];

    for (const { zoneId, records } of zones) {
      if (records.length === 0) continue;
      try {
        const command = new ChangeResourceRecordSetsCommand({
          HostedZoneId: zoneId,
          ChangeBatch: {
            Comment: 'DNS Auto Register: テストレコード一括削除',
            Changes: records.map((r) => ({
              Action: 'DELETE' as const,
              ResourceRecordSet: {
                Name: r.name,
                Type: r.type,
                TTL: r.ttl,
                ResourceRecords: [{ Value: r.value }],
              },
            })),
          },
        });
        await this.route53Client.send(command);
        deletedCount += records.length;
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'テストレコードの削除に失敗しました。';
        for (const r of records) {
          failures.push({ name: r.name, reason });
        }
      }
    }

    if (failures.length > 0) {
      console.log('テストレコードの削除に失敗しました。');
    } else {
      console.log(`テストレコードの削除が完了しました。削除件数: ${deletedCount}件`);
    }

    return { deletedCount, failedCount: failures.length, failures };
  }
}
