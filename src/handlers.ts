/**
 * 共通業務ロジック層
 * MCPサーバーとCLIの両方から呼び出される業務ロジック関数群
 * console.log、process.exitは使用しない
 */

import {
  Route53Client,
  ChangeResourceRecordSetsCommand,
} from '@aws-sdk/client-route-53';
import { RecordManager } from './manager';
import { generateRecords } from './generator';
import { validateShopName, validateShopCode, validateStartIp } from './validator';
import { loadLastRegistration, isWithinUndoWindow, saveLastRegistration } from './undo';
import { TestRecordManager } from './test-manager';
import type { Config, EncodeNameParams, EncodeNameResult, CreateRecordsParams, CreateRecordsResult, AddDeviceParams, AddDeviceResult, UndoResult, ListTestsResult, DeleteTestsResult } from './types';

/** テストモード時のプレフィックス */
const TEST_PREFIX = '__dns_auto_test-';

/**
 * encode-name ハンドラ
 * 店舗名（平文）をUTF-8 Base64エンコードし、TXTレコードとして登録する
 *
 * - validateShopName, validateShopCodeでバリデーション
 * - 本番モード時はRecordManager.checkDuplicateTxtで重複チェック
 * - テストモード時は__dns_auto_test-プレフィックスを付与しUPSERTアクションで登録
 */
export async function handleEncodeName(
  params: EncodeNameParams,
  route53Client: Route53Client,
  config: Config,
): Promise<EncodeNameResult> {
  const { shopName, shopCode, testMode } = params;

  // 店舗コードバリデーション
  const codeResult = validateShopCode(shopCode);
  if (!codeResult.valid) {
    return { success: false, error: codeResult.error };
  }

  // 店舗名バリデーション
  const nameResult = validateShopName(shopName);
  if (!nameResult.valid) {
    return { success: false, error: nameResult.error };
  }

  // Base64エンコード（内部で完結）
  const base64Value = Buffer.from(shopName, 'utf-8').toString('base64');

  const testPrefix = testMode ? TEST_PREFIX : '';
  const txtRecordName = `${testPrefix}${shopCode}.yamaokaya.net`;
  const txtRecordValue = `"${base64Value}"`;

  // 本番モード時: 重複チェック
  if (!testMode) {
    const manager = new RecordManager(route53Client);
    const isDuplicate = await manager.checkDuplicateTxt(
      txtRecordName,
      config.yamaokayaZoneId,
    );
    if (isDuplicate) {
      return { success: false, error: 'このTXTレコードは既に登録されています。' };
    }
  }

  const action = testMode ? 'UPSERT' : 'CREATE';

  // Route53 API で TXT レコード登録
  const command = new ChangeResourceRecordSetsCommand({
    HostedZoneId: config.yamaokayaZoneId,
    ChangeBatch: {
      Comment: 'DNS Auto Register: encode-name TXT record',
      Changes: [
        {
          Action: action,
          ResourceRecordSet: {
            Name: txtRecordName,
            Type: 'TXT',
            TTL: 300,
            ResourceRecords: [{ Value: txtRecordValue }],
          },
        },
      ],
    },
  });
  await route53Client.send(command);

  return {
    success: true,
    txtRecordName,
    base64Value,
  };
}

/**
 * create-records ハンドラ
 * Aレコード62件 + menkata CNAME 62件を一括登録する
 *
 * - validateShopCode, validateStartIpでバリデーション
 * - generateRecordsでレコード定義を生成
 * - 本番モード時はRecordManager.checkDuplicateShopCodeで重複チェック
 * - RecordManager.registerRecordsで登録
 * - 本番モード時はsaveLastRegistrationでundo情報を保存
 * - menkata登録失敗時の自動ロールバックはRecordManager内で処理済み
 */
export async function handleCreateRecords(
  params: CreateRecordsParams,
  route53Client: Route53Client,
  config: Config,
): Promise<CreateRecordsResult> {
  const { shopCode, startIp, testMode } = params;

  // 店舗コードバリデーション
  const codeResult = validateShopCode(shopCode);
  if (!codeResult.valid) {
    return { success: false, error: codeResult.error };
  }

  // 先頭IPアドレスバリデーション
  const ipResult = validateStartIp(startIp);
  if (!ipResult.valid) {
    return { success: false, error: ipResult.error };
  }

  const manager = new RecordManager(route53Client);
  const testPrefix = testMode ? TEST_PREFIX : '';

  // レコード生成（devicesは空オブジェクト）
  const records = generateRecords(shopCode, startIp, {}, config, testPrefix);

  // 重複チェック（本番モード時のみ）
  if (!testMode) {
    const isDuplicate = await manager.checkDuplicateShopCode(shopCode, config.yamaokayaZoneId);
    if (isDuplicate) {
      return { success: false, error: 'この店舗コードのレコードは既に登録されています。' };
    }
  }

  // レコード登録
  const result = await manager.registerRecords(records, config, testMode);
  if (!result.success) {
    return { success: false, error: result.error };
  }

  // undo情報保存（本番モード時のみ）
  if (!testMode) {
    saveLastRegistration({
      shopCode,
      shopName: '',
      registeredAt: new Date().toISOString(),
      records,
    });
  }

  return {
    success: true,
    recordCount: result.recordCount,
    yamaokayaChangeId: result.yamaokayaChangeId,
    menkataChangeId: result.menkataChangeId,
  };
}


/**
 * add-device ハンドラ
 * 1機器のCNAMEエイリアスを登録する
 *
 * - validateShopCodeで店舗コードをバリデーション
 * - IPアドレス形式を検証（192.168.x.x、各オクテット0-255）
 * - Aレコード名を算出（第3・第4オクテットを3桁ゼロパディング）
 * - 本番モード時はRecordManager.checkDuplicateCnameで重複チェック
 * - テストモード時は__dns_auto_test-プレフィックスを付与しUPSERTアクションで登録
 */
export async function handleAddDevice(
  params: AddDeviceParams,
  route53Client: Route53Client,
  config: Config,
): Promise<AddDeviceResult> {
  const { shopCode, device, ip, testMode } = params;

  // 店舗コードバリデーション
  const codeResult = validateShopCode(shopCode);
  if (!codeResult.valid) {
    return { success: false, error: codeResult.error };
  }

  // IPアドレス検証（192.168.x.x 形式）
  const ipPattern = /^192\.168\.(\d{1,3})\.(\d{1,3})$/;
  const ipMatch = ipPattern.exec(ip);
  if (!ipMatch) {
    return { success: false, error: 'IPアドレスが正しくありません。192.168.x.x の形式で入力してください。' };
  }
  const oct3 = parseInt(ipMatch[1], 10);
  const oct4 = parseInt(ipMatch[2], 10);
  if (oct3 > 255 || oct4 > 255) {
    return { success: false, error: 'IPアドレスが正しくありません。192.168.x.x の形式で入力してください。' };
  }

  const testPrefix = testMode ? TEST_PREFIX : '';

  // Aレコード名算出（3桁ゼロパディング）
  const paddedOct3 = String(oct3).padStart(3, '0');
  const paddedOct4 = String(oct4).padStart(3, '0');
  const aRecordName = `${testPrefix}ip192-168-${paddedOct3}-${paddedOct4}.${shopCode}.yamaokaya.net`;

  // CNAMEレコード名
  const cnameRecordName = `${testPrefix}${device}.${shopCode}.yamaokaya.net`;

  // 本番モード時: 重複チェック
  if (!testMode) {
    const manager = new RecordManager(route53Client);
    const isDuplicate = await manager.checkDuplicateCname(
      cnameRecordName,
      config.yamaokayaZoneId,
    );
    if (isDuplicate) {
      return { success: false, error: 'このCNAMEレコードは既に登録されています。' };
    }
  }

  const action = testMode ? 'UPSERT' : 'CREATE';

  // Route53 API で CNAME 登録
  const command = new ChangeResourceRecordSetsCommand({
    HostedZoneId: config.yamaokayaZoneId,
    ChangeBatch: {
      Comment: 'DNS Auto Register: add-device CNAME',
      Changes: [
        {
          Action: action,
          ResourceRecordSet: {
            Name: cnameRecordName,
            Type: 'CNAME',
            TTL: config.ttl.cnameAlias,
            ResourceRecords: [{ Value: aRecordName }],
          },
        },
      ],
    },
  });
  await route53Client.send(command);

  return {
    success: true,
    cnameRecordName,
    aliasTarget: aRecordName,
  };
}


/**
 * undo ハンドラ
 * 直前の登録を取り消す
 *
 * - loadLastRegistrationで直前の登録情報を読み込む
 * - 登録情報が存在しない場合はメッセージを返す
 * - isWithinUndoWindowで取り消し期限を判定
 * - RecordManager.deleteRecordsで両ゾーンのレコードを削除
 */
export async function handleUndo(
  route53Client: Route53Client,
  config: Config,
): Promise<UndoResult> {
  // 直前の登録情報を読み込み
  const lastReg = loadLastRegistration();
  if (!lastReg) {
    return {
      success: false,
      message: '取り消し可能な登録がありません。',
    };
  }

  // 取り消し期限チェック（同日以内）
  if (!isWithinUndoWindow(lastReg.registeredAt)) {
    return {
      success: false,
      message: '登録日と異なる日付のため、取り消しできません。IT部門に連絡してください。',
    };
  }

  // レコード削除
  const manager = new RecordManager(route53Client);
  await manager.deleteRecords(lastReg.records, config);

  return {
    success: true,
    message: 'レコードの取り消しが完了しました。',
    shopCode: lastReg.shopCode,
    shopName: lastReg.shopName,
  };
}

/**
 * list-tests ハンドラ
 * 両ゾーンのテストレコード一覧を取得する
 *
 * - TestRecordManager.listTestRecordsで両ゾーンのテストレコードを取得
 * - 構造化データとして返却
 */
export async function handleListTests(
  route53Client: Route53Client,
  config: Config,
): Promise<ListTestsResult> {
  const testManager = new TestRecordManager(route53Client);

  const yamaokayaRecords = await testManager.listTestRecords(config.yamaokayaZoneId, 'yamaokaya.net');
  const menkataRecords = await testManager.listTestRecords(config.menkataZoneId, 'internal.menkata.me');

  return {
    yamaokayaRecords,
    menkataRecords,
    totalCount: yamaokayaRecords.length + menkataRecords.length,
  };
}

/**
 * delete-tests ハンドラ
 * テストレコードを一括削除する
 *
 * - TestRecordManager.listTestRecordsで両ゾーンのテストレコードを取得
 * - レコードが存在しない場合は0件結果を返す
 * - TestRecordManager.deleteAllTestRecordsで一括削除
 */
export async function handleDeleteTests(
  route53Client: Route53Client,
  config: Config,
): Promise<DeleteTestsResult> {
  const testManager = new TestRecordManager(route53Client);

  // テストレコード一覧を取得
  const yamaokayaRecords = await testManager.listTestRecords(config.yamaokayaZoneId, 'yamaokaya.net');
  const menkataRecords = await testManager.listTestRecords(config.menkataZoneId, 'internal.menkata.me');

  if (yamaokayaRecords.length === 0 && menkataRecords.length === 0) {
    return { deletedCount: 0, failedCount: 0, failures: [] };
  }

  // 一括削除実行（事前取得済みレコードを渡し、内部での再取得を排除）
  const result = await testManager.deleteAllTestRecords(
    { yamaokayaRecords, menkataRecords },
    config,
  );

  return {
    deletedCount: result.deletedCount,
    failedCount: result.failedCount,
    failures: result.failures,
  };
}
