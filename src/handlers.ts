/**
 * 共通業務ロジック層
 * MCPサーバーとCLIの両方から呼び出される業務ロジック関数群
 * console.log、process.exitは使用しない
 */

import {
  Route53Client,
  ChangeResourceRecordSetsCommand,
} from '@aws-sdk/client-route-53';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { RecordManager } from './manager';
import { generateRecords } from './generator';
import { validateShopName, validateShopCode, validateStartIp } from './validator';
import { loadLastRegistration, isWithinUndoWindow, saveLastRegistration } from './undo';
import { TestRecordManager } from './test-manager';
import type { Config, DnsRecord, EncodeNameParams, EncodeNameResult, CreateRecordsParams, CreateRecordsResult, AddDeviceParams, AddDeviceResult, UndoResult, ListTestsResult, DeleteTestsResult } from './types';

/** テストモード時のプレフィックス */
const TEST_PREFIX = 'auto_dns_test_';

/** テストレコード情報ファイルのパス */
const TEST_RECORDS_FILE = resolve(__dirname, '..', 'test-records.json');

/** undo情報ファイルのパス */
const UNDO_FILE = resolve(__dirname, '..', '.last-registration.json');

/**
 * ファイルの書き込み可否を事前チェックする
 * Route53への登録前に呼び出し、書き込みできない場合はエラーを返す
 */
function checkFileWritable(filePath: string): string | null {
  try {
    const testContent = existsSync(filePath) ? readFileSync(filePath, 'utf-8') : '';
    writeFileSync(filePath, testContent || '{}', 'utf-8');
    return null;
  } catch {
    return `ファイルの書き込みに失敗しました: ${filePath}。IT部門に連絡してください。`;
  }
}

/**
 * 登録前の書き込みチェック
 * テストモード: test-records.json
 * 本番モード: .last-registration.json
 */
function preflightWriteCheck(testMode: boolean): string | null {
  if (testMode) {
    return checkFileWritable(TEST_RECORDS_FILE);
  } else {
    return checkFileWritable(UNDO_FILE);
  }
}

/** テストレコード情報の型 */
interface TestRecordEntry {
  zoneId: string;
  name: string;
  type: 'A' | 'CNAME' | 'TXT';
  value: string;
  ttl: number;
  registeredAt: string;
}

/** テストレコード情報をファイルから読み込む */
function loadTestRecords(): TestRecordEntry[] {
  try {
    if (!existsSync(TEST_RECORDS_FILE)) return [];
    const data = JSON.parse(readFileSync(TEST_RECORDS_FILE, 'utf-8'));
    return data.records ?? [];
  } catch {
    return [];
  }
}

/** テストレコード情報をファイルに保存する */
function saveTestRecords(records: TestRecordEntry[]): void {
  writeFileSync(TEST_RECORDS_FILE, JSON.stringify({ records }, null, 2), 'utf-8');
}

/** テストレコード情報をファイルに追記する */
function appendTestRecords(newRecords: TestRecordEntry[]): void {
  const existing = loadTestRecords();
  saveTestRecords([...existing, ...newRecords]);
}

/**
 * encode-name ハンドラ
 * 店舗名（平文）をUTF-8 Base64エンコードし、TXTレコードとして登録する
 *
 * - validateShopName, validateShopCodeでバリデーション
 * - 本番モード時はRecordManager.checkDuplicateTxtで重複チェック
 * - テストモード時はauto_dns_test_プレフィックスを付与しUPSERTアクションで登録
 */
export async function handleEncodeName(
  params: EncodeNameParams,
  route53Client: Route53Client,
  config: Config,
): Promise<EncodeNameResult> {
  const { shopName, shopCode, testMode } = params;

  // 書き込みチェック（Route53登録前に実施）
  const writeError = preflightWriteCheck(testMode);
  if (writeError) {
    return { success: false, error: writeError };
  }

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

  // テストモード時: レコード情報をファイルに保存
  if (testMode) {
    appendTestRecords([{
      zoneId: config.yamaokayaZoneId,
      name: txtRecordName,
      type: 'TXT',
      value: txtRecordValue,
      ttl: 300,
      registeredAt: new Date().toISOString(),
    }]);
  }

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

  // 書き込みチェック（Route53登録前に実施）
  const writeError = preflightWriteCheck(testMode);
  if (writeError) {
    return { success: false, error: writeError };
  }

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

  // テストモード時: レコード情報をファイルに保存
  if (testMode) {
    const now = new Date().toISOString();
    const entries: TestRecordEntry[] = [];
    for (const r of [...records.yamaokayaARecords, ...records.yamaokayaCnameAliases]) {
      entries.push({ zoneId: config.yamaokayaZoneId, name: r.name, type: r.type, value: r.value, ttl: r.ttl, registeredAt: now });
    }
    for (const r of records.menkataCnameRecords) {
      entries.push({ zoneId: config.menkataZoneId, name: r.name, type: r.type, value: r.value, ttl: r.ttl, registeredAt: now });
    }
    appendTestRecords(entries);
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
 * - テストモード時はauto_dns_test_プレフィックスを付与しUPSERTアクションで登録
 */
export async function handleAddDevice(
  params: AddDeviceParams,
  route53Client: Route53Client,
  config: Config,
): Promise<AddDeviceResult> {
  const { shopCode, device, ip, testMode } = params;

  // 書き込みチェック（Route53登録前に実施）
  const writeError = preflightWriteCheck(testMode);
  if (writeError) {
    return { success: false, error: writeError };
  }

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

  // テストモード時: レコード情報をファイルに保存
  if (testMode) {
    appendTestRecords([{
      zoneId: config.yamaokayaZoneId,
      name: cnameRecordName,
      type: 'CNAME',
      value: aRecordName,
      ttl: config.ttl.cnameAlias,
      registeredAt: new Date().toISOString(),
    }]);
  }

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

  const yamaokayaRecords = await testManager.listTestRecords(config.yamaokayaZoneId);
  const menkataRecords = await testManager.listTestRecords(config.menkataZoneId);

  return {
    yamaokayaRecords,
    menkataRecords,
    totalCount: yamaokayaRecords.length + menkataRecords.length,
  };
}

/**
 * delete-tests ハンドラ（MCP用: ファイルベース削除）
 * テストレコード情報ファイルから読み込み、Route53 APIで直接削除する
 * 全スキャン不要のため高速
 */
export async function handleDeleteTests(
  route53Client: Route53Client,
  config: Config,
): Promise<DeleteTestsResult> {
  const entries = loadTestRecords();

  if (entries.length === 0) {
    return { deletedCount: 0, failedCount: 0, failures: [] };
  }

  let deletedCount = 0;
  const failures: Array<{ name: string; reason: string }> = [];
  const remainingEntries: TestRecordEntry[] = [];

  // ゾーンごとにグループ化して一括削除
  const byZone = new Map<string, TestRecordEntry[]>();
  for (const entry of entries) {
    const list = byZone.get(entry.zoneId) ?? [];
    list.push(entry);
    byZone.set(entry.zoneId, list);
  }

  for (const [zoneId, zoneEntries] of byZone) {
    try {
      const command = new ChangeResourceRecordSetsCommand({
        HostedZoneId: zoneId,
        ChangeBatch: {
          Comment: 'DNS Auto Register: テストレコード一括削除',
          Changes: zoneEntries.map((e) => ({
            Action: 'DELETE' as const,
            ResourceRecordSet: {
              Name: e.name,
              Type: e.type,
              TTL: e.ttl,
              ResourceRecords: [{ Value: e.value }],
            },
          })),
        },
      });
      await route53Client.send(command);
      deletedCount += zoneEntries.length;
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'テストレコードの削除に失敗しました。';
      for (const e of zoneEntries) {
        failures.push({ name: e.name, reason });
        remainingEntries.push(e);
      }
    }
  }

  // 削除成功分をファイルから除去
  saveTestRecords(remainingEntries);

  return { deletedCount, failedCount: failures.length, failures };
}

/**
 * delete-tests ハンドラ（CLI用: 全スキャン削除）
 * Route53を全スキャンしてテストレコードを検出・削除する
 * ファイル喪失時のフォールバック用
 */
export async function handleDeleteTestsFullScan(
  route53Client: Route53Client,
  config: Config,
): Promise<DeleteTestsResult> {
  const testManager = new TestRecordManager(route53Client);

  const yamaokayaRecords = await testManager.listTestRecords(config.yamaokayaZoneId);
  const menkataRecords = await testManager.listTestRecords(config.menkataZoneId);

  if (yamaokayaRecords.length === 0 && menkataRecords.length === 0) {
    return { deletedCount: 0, failedCount: 0, failures: [] };
  }

  const result = await testManager.deleteAllTestRecords(
    { yamaokayaRecords, menkataRecords },
    config,
  );

  // 削除成功時はファイルもクリア
  if (result.failedCount === 0) {
    saveTestRecords([]);
  }

  return {
    deletedCount: result.deletedCount,
    failedCount: result.failedCount,
    failures: result.failures,
  };
}
