#!/usr/bin/env node

/**
 * CLIエントリポイント
 * コマンドライン引数を解析し、各モジュールを呼び出してフロー制御を行う
 */

import { Route53Client, ChangeResourceRecordSetsCommand } from '@aws-sdk/client-route-53';
import { readFileSync } from 'fs';
import { generateRecords } from './generator';
import { RecordManager } from './manager';
import { TestRecordManager } from './test-manager';
import { validateShopName, validateShopCode, validateStartIp } from './validator';
import { loadLastRegistration, isWithinUndoWindow, saveLastRegistration } from './undo';
import type { Config } from './types';

/** テストモード時のプレフィックス */
const TEST_PREFIX = '__dns_auto_test-';

/** コマンドライン引数をパースする（--key value と --flag パターン対応） */
function parseArgs(args: string[]): Record<string, string | boolean> {
  const result: Record<string, string | boolean> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = args[i + 1];
    if (next === undefined || next.startsWith('--')) {
      result[key] = true;
    } else {
      result[key] = next;
      i++;
    }
  }
  return result;
}

/**
 * .envファイルを読み込み、環境変数に設定する
 * KEY=VALUE 形式の各行をパースし、process.env に設定する
 * コメント行（#）と空行はスキップする
 */
function loadEnvFile(filePath: string): void {
  const content = readFileSync(filePath, 'utf-8');
  for (const line of content.split('\n')) {
    let trimmed = line.replace(/\r$/, '').trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    if (trimmed.startsWith('export ')) {
      trimmed = trimmed.slice(7);
    }
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    process.env[key] = value;
  }
}

/**
 * 環境変数からConfig オブジェクトを構築する
 * ゾーン ID とリージョンはハードコード（固定値）
 * AWS 認証情報は .env から読み込まれる（process.env 経由）
 */
function buildConfigFromEnv(): Config {
  return {
    yamaokayaZoneId: 'ZPS49ZOFSRKVC',
    menkataZoneId: 'Z06858143PXEUA7VN6S4G',
    region: 'ap-northeast-1',
    aliases: [],
    ttl: {
      aRecord: 300,
      cnameAlias: 3600,
      menkataCname: 300,
    },
  };
}

/**
 * register コマンド廃止ハンドラ
 * 廃止メッセージと新コマンド体系の案内を表示して終了する
 */
function handleRegisterDeprecated(): void {
  console.log('register コマンドは廃止されました。以下の新しいコマンドを使用してください:');
  console.log('');
  console.log('  encode-name    店舗名の Base64 エンコード・TXT レコード登録');
  console.log('  create-records A レコード 62件 + menkata CNAME 62件の一括登録');
  console.log('  add-device     機器ごとの CNAME エイリアス登録');
  console.log('');
  console.log('詳細は README.md を参照してください。');
  process.exit(1);
}

/**
 * encode-name コマンドハンドラ
 * 店舗名を UTF-8 Base64 エンコードし、TXT レコードとして登録する
 * --shop-name: 日本語の店舗名（ローカル実行用、内部でBase64エンコード）
 * --shop-name-base64: 既にBase64エンコード済みの値（Cowork経由用）
 * どちらか一方を指定。両方指定時は --shop-name-base64 を優先。
 */
async function handleEncodeName(args: Record<string, string | boolean>): Promise<void> {
  const shopNameBase64 = args['shop-name-base64'];
  const shopNameRaw = args['shop-name'];
  const shopCode = args['shop-code'];
  const testMode = args['test'] === true;

  // 店舗コード必須チェック
  if (!shopCode || typeof shopCode !== 'string') {
    console.error('必須引数が不足しています。--shop-code を指定してください。');
    process.exit(1);
  }
  const codeResult = validateShopCode(shopCode);
  if (!codeResult.valid) {
    console.error(codeResult.error);
    process.exit(1);
  }

  // 店舗名の取得（--shop-name-base64 優先）
  let base64Value: string;
  if (shopNameBase64 && typeof shopNameBase64 === 'string') {
    base64Value = shopNameBase64;
  } else if (shopNameRaw && typeof shopNameRaw === 'string') {
    const nameResult = validateShopName(shopNameRaw);
    if (!nameResult.valid) {
      console.error(nameResult.error);
      process.exit(1);
    }
    base64Value = Buffer.from(shopNameRaw, 'utf-8').toString('base64');
  } else {
    console.error('--shop-name または --shop-name-base64 を指定してください。');
    process.exit(1);
  }

  const yamaokayaZoneId = 'ZPS49ZOFSRKVC';
  const region = 'ap-northeast-1';
  const route53 = new Route53Client({ region });
  const testPrefix = testMode ? TEST_PREFIX : '';

  // TXT レコード名と値
  const txtRecordName = `${testPrefix}${shopCode}.yamaokaya.net`;
  const txtRecordValue = `"${base64Value}"`;

  // 本番モード時: 重複チェック + CREATE
  if (!testMode) {
    const manager = new RecordManager(route53);
    const isDuplicate = await manager.checkDuplicateTxt(txtRecordName, yamaokayaZoneId);
    if (isDuplicate) {
      console.error('このTXTレコードは既に登録されています。');
      process.exit(1);
    }
  }
  const action = testMode ? 'UPSERT' : 'CREATE';

  // Route53 API で TXT レコード登録
  const command = new ChangeResourceRecordSetsCommand({
    HostedZoneId: yamaokayaZoneId,
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
  await route53.send(command);

  console.log(`TXT レコード名: ${txtRecordName}`);
  console.log(`Base64 値: ${base64Value}`);
}

/**
 * create-records コマンドハンドラ
 * A レコード 62件 + menkata CNAME 62件を一括登録する
 */
async function handleCreateRecords(args: Record<string, string | boolean>): Promise<void> {
  const shopCode = args['shop-code'];
  const startIp = args['start-ip'];
  const testMode = args['test'] === true;

  // 必須引数チェック
  if (!shopCode || typeof shopCode !== 'string') {
    console.error('必須引数が不足しています。--shop-code を指定してください。');
    process.exit(1);
  }
  if (!startIp || typeof startIp !== 'string') {
    console.error('必須引数が不足しています。--start-ip を指定してください。');
    process.exit(1);
  }

  // バリデーション
  const codeResult = validateShopCode(shopCode);
  if (!codeResult.valid) {
    console.error(codeResult.error);
    process.exit(1);
  }
  const ipResult = validateStartIp(startIp);
  if (!ipResult.valid) {
    console.error(ipResult.error);
    process.exit(1);
  }

  const config = buildConfigFromEnv();
  const route53 = new Route53Client({ region: config.region });
  const manager = new RecordManager(route53);
  const testPrefix = testMode ? TEST_PREFIX : '';

  // レコード生成（devices は空オブジェクト）
  const records = generateRecords(shopCode, startIp, {}, config, testPrefix);

  // 重複チェック（テストモード以外）
  if (!testMode) {
    const isDuplicate = await manager.checkDuplicateShopCode(shopCode, config.yamaokayaZoneId);
    if (isDuplicate) {
      console.error('この店舗コードのレコードは既に登録されています。');
      process.exit(1);
    }
  }

  // レコード登録
  const result = await manager.registerRecords(records, config, testMode);
  if (!result.success) {
    console.error(result.error);
    process.exit(1);
  }

  // 同期確認
  if (result.yamaokayaChangeId) {
    await manager.waitForSync(result.yamaokayaChangeId);
  }

  // undo 情報保存（テストモード以外）
  if (!testMode) {
    saveLastRegistration({
      shopCode,
      shopName: '',
      registeredAt: new Date().toISOString(),
      records,
    });
  }

  console.log(`登録レコード数: ${result.recordCount}件`);
  if (result.yamaokayaChangeId) {
    console.log(`yamaokaya.net Change ID: ${result.yamaokayaChangeId}`);
  }
  if (result.menkataChangeId) {
    console.log(`internal.menkata.me Change ID: ${result.menkataChangeId}`);
  }
}

/**
 * add-device コマンドハンドラ
 * 1機器の CNAME エイリアスを登録する
 */
async function handleAddDevice(args: Record<string, string | boolean>): Promise<void> {
  const shopCode = args['shop-code'];
  const device = args['device'];
  const ip = args['ip'];
  const testMode = args['test'] === true;

  // 必須引数チェック
  if (!shopCode || typeof shopCode !== 'string') {
    console.error('必須引数が不足しています。--shop-code を指定してください。');
    process.exit(1);
  }
  if (!device || typeof device !== 'string') {
    console.error('必須引数が不足しています。--device を指定してください。');
    process.exit(1);
  }
  if (!ip || typeof ip !== 'string') {
    console.error('必須引数が不足しています。--ip を指定してください。');
    process.exit(1);
  }

  // 店舗コードバリデーション
  const codeResult = validateShopCode(shopCode);
  if (!codeResult.valid) {
    console.error(codeResult.error);
    process.exit(1);
  }

  // IPアドレス検証（192.168.x.x 形式）
  const ipPattern = /^192\.168\.(\d{1,3})\.(\d{1,3})$/;
  const ipMatch = ipPattern.exec(ip);
  if (!ipMatch) {
    console.error('IPアドレスが正しくありません。192.168.x.x の形式で入力してください。');
    process.exit(1);
  }
  const oct3 = parseInt(ipMatch[1], 10);
  const oct4 = parseInt(ipMatch[2], 10);
  if (oct3 > 255 || oct4 > 255) {
    console.error('IPアドレスが正しくありません。192.168.x.x の形式で入力してください。');
    process.exit(1);
  }

  const yamaokayaZoneId = 'ZPS49ZOFSRKVC';
  const region = 'ap-northeast-1';
  const route53 = new Route53Client({ region });
  const testPrefix = testMode ? TEST_PREFIX : '';

  // A レコード名算出（3桁ゼロパディング）
  const paddedOct3 = String(oct3).padStart(3, '0');
  const paddedOct4 = String(oct4).padStart(3, '0');
  const aRecordName = `${testPrefix}ip192-168-${paddedOct3}-${paddedOct4}.${shopCode}.yamaokaya.net`;

  // CNAME レコード名
  const cnameRecordName = `${testPrefix}${device}.${shopCode}.yamaokaya.net`;

  // 本番モード時: 重複チェック + CREATE
  if (!testMode) {
    const manager = new RecordManager(route53);
    const isDuplicate = await manager.checkDuplicateCname(cnameRecordName, yamaokayaZoneId);
    if (isDuplicate) {
      console.error('このCNAMEレコードは既に登録されています。');
      process.exit(1);
    }
  }
  const action = testMode ? 'UPSERT' : 'CREATE';

  // Route53 API で CNAME 登録
  const command = new ChangeResourceRecordSetsCommand({
    HostedZoneId: yamaokayaZoneId,
    ChangeBatch: {
      Comment: 'DNS Auto Register: add-device CNAME',
      Changes: [
        {
          Action: action,
          ResourceRecordSet: {
            Name: cnameRecordName,
            Type: 'CNAME',
            TTL: 3600,
            ResourceRecords: [{ Value: aRecordName }],
          },
        },
      ],
    },
  });
  await route53.send(command);

  console.log(`CNAME レコード名: ${cnameRecordName}`);
  console.log(`エイリアス先: ${aRecordName}`);
}

/** undoコマンドの実行（非対話型: 即実行） */
async function handleUndo(): Promise<void> {
  const config = buildConfigFromEnv();
  const route53 = new Route53Client({ region: config.region });
  const manager = new RecordManager(route53);

  // 直前の登録情報を読み込み
  const lastReg = loadLastRegistration();
  if (!lastReg) {
    console.log('取り消し可能な登録がありません。');
    return;
  }

  // 取り消し期限チェック（30分）
  if (!isWithinUndoWindow(lastReg.registeredAt)) {
    console.log('登録日と異なる日付のため、取り消しできません。IT部門に連絡してください。');
    return;
  }

  // 取り消し対象の表示
  console.log(`\n${lastReg.shopName}（${lastReg.shopCode}）の登録を取り消します。\n`);

  // レコード削除
  console.log('レコードを削除中...');
  await manager.deleteRecords(lastReg.records, config);

  console.log('レコードの取り消しが完了しました。');
}

/** list-testsコマンドの実行 */
async function handleListTests(): Promise<void> {
  const config = buildConfigFromEnv();
  const route53 = new Route53Client({ region: config.region });
  const testManager = new TestRecordManager(route53);

  // 両ゾーンのテストレコードを取得
  const yamaokayaRecords = await testManager.listTestRecords(config.yamaokayaZoneId);
  const menkataRecords = await testManager.listTestRecords(config.menkataZoneId);

  if (yamaokayaRecords.length === 0 && menkataRecords.length === 0) {
    console.log('テストレコードが見つかりません。');
    return;
  }

  console.log('\n=== テストレコード一覧 ===');
  if (yamaokayaRecords.length > 0) {
    console.log(`\nyamaokaya.net（${yamaokayaRecords.length}件）:`);
    for (const r of yamaokayaRecords) {
      console.log(`  ${r.type}\t${r.name}\t→ ${r.value}`);
    }
  }
  if (menkataRecords.length > 0) {
    console.log(`\ninternal.menkata.me（${menkataRecords.length}件）:`);
    for (const r of menkataRecords) {
      console.log(`  ${r.type}\t${r.name}\t→ ${r.value}`);
    }
  }
  console.log('==========================\n');
}

/** delete-testsコマンドの実行（非対話型: 即実行） */
async function handleDeleteTests(): Promise<void> {
  const config = buildConfigFromEnv();
  const route53 = new Route53Client({ region: config.region });
  const testManager = new TestRecordManager(route53);

  // テストレコード一覧を取得
  const yamaokayaRecords = await testManager.listTestRecords(config.yamaokayaZoneId);
  const menkataRecords = await testManager.listTestRecords(config.menkataZoneId);

  if (yamaokayaRecords.length === 0 && menkataRecords.length === 0) {
    console.log('削除対象のテストレコードが見つかりません。');
    return;
  }

  // 確認メッセージ
  console.log('\nテスト用のデータを削除します。本番環境には影響しません。\n');

  // 一括削除実行（事前取得済みレコードを渡し、内部での再取得を排除）
  const result = await testManager.deleteAllTestRecords({ yamaokayaRecords, menkataRecords }, config);

  // 結果表示
  console.log('\n=== 削除結果 ===');
  console.log(`削除成功: ${result.deletedCount}件`);
  if (result.failedCount > 0) {
    console.log(`削除失敗: ${result.failedCount}件`);
    for (const f of result.failures) {
      console.log(`  ${f.name}: ${f.reason}`);
    }
  }
  console.log('================\n');
}

/** AWS認証エラーを判定してメッセージを返す（該当しなければnull） */
export function getAwsAuthErrorMessage(error: unknown): string | null {
  if (!(error instanceof Error)) return null;
  const name = (error as { name?: string }).name ?? '';
  const message = error.message;

  // 認証未設定
  if (
    name === 'CredentialsProviderError' ||
    message.includes('Could not load credentials') ||
    message.includes('Missing credentials')
  ) {
    return 'AWSの認証設定がされていません。セットアップ手順を確認してください。';
  }

  // 認証情報の期限切れ・無効
  if (
    name === 'ExpiredTokenException' ||
    name === 'InvalidSignatureException' ||
    name === 'AccessDeniedException' ||
    name === 'InvalidClientTokenId' ||
    name === 'SignatureDoesNotMatch' ||
    message.includes('expired') ||
    message.includes('invalid')
  ) {
    return 'AWSの認証情報が無効です。IT部門に連絡してください。';
  }

  return null;
}

/** ネットワーク接続エラーかどうかを判定する */
export function isNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message;
  const name = (error as { name?: string }).name ?? '';
  const code = (error as { code?: string }).code ?? '';
  return (
    code === 'ENOTFOUND' ||
    code === 'ETIMEDOUT' ||
    code === 'ECONNREFUSED' ||
    code === 'ECONNRESET' ||
    code === 'ERR_NETWORK' ||
    name === 'NetworkingError' ||
    message.includes('getaddrinfo') ||
    message.includes('Network error') ||
    message.includes('fetch failed')
  );
}

/** メインエントリポイント */
async function main(): Promise<void> {
  const command = process.argv[2];
  const args = parseArgs(process.argv.slice(3));

  // --env-file オプション: 指定された.envファイルから環境変数を読み込む
  if (args['env-file'] && typeof args['env-file'] === 'string') {
    loadEnvFile(args['env-file']);
  }

  try {
    switch (command) {
      case 'encode-name':
        await handleEncodeName(args);
        break;
      case 'create-records':
        await handleCreateRecords(args);
        break;
      case 'add-device':
        await handleAddDevice(args);
        break;
      case 'register':
        handleRegisterDeprecated();
        break;
      case 'undo':
        await handleUndo();
        break;
      case 'list-tests':
        await handleListTests();
        break;
      case 'delete-tests':
        await handleDeleteTests();
        break;
      default:
        console.error(
          command
            ? `不明なコマンドです: ${command}`
            : 'コマンドを指定してください。'
        );
        console.error('使用可能なコマンド: encode-name, create-records, add-device, undo, list-tests, delete-tests');
        process.exit(1);
    }
  } catch (error) {
    // non-interactiveモード: 技術的メッセージをそのまま表示
    const authMessage = getAwsAuthErrorMessage(error);
    if (authMessage) {
      console.error(authMessage);
      process.exit(1);
    }
    const message = error instanceof Error ? error.message : '予期しないエラーが発生しました。';
    console.error(message);
    process.exit(1);
  }
}

main();
