#!/usr/bin/env node

/**
 * CLIエントリポイント
 * コマンドライン引数を解析し、handlers.tsの共通業務ロジック層を呼び出してコンソール出力する
 * 業務ロジックはhandlers.tsに委譲し、cli.tsはI/O制御（console.log、process.exit）のみ担当する
 */

import { Route53Client } from '@aws-sdk/client-route-53';
import { readFileSync } from 'fs';
import {
  handleEncodeName,
  handleCreateRecords,
  handleAddDevice,
  handleUndo,
  handleListTests,
  handleDeleteTests,
} from './handlers';
import type { Config } from './types';

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
export function loadEnvFile(filePath: string): void {
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
export function buildConfigFromEnv(): Config {
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

/**
 * encode-name コマンドハンドラ
 * 店舗名（平文）を受け取り、handlers.tsのhandleEncodeNameを呼び出す
 * --shop-name: 日本語の店舗名（内部でBase64エンコード）
 * --shop-name-base64 は廃止
 */
async function cliEncodeName(args: Record<string, string | boolean>): Promise<void> {
  const shopName = args['shop-name'];
  const shopCode = args['shop-code'];
  const testMode = args['test'] === true;

  // 店舗コード必須チェック
  if (!shopCode || typeof shopCode !== 'string') {
    console.error('必須引数が不足しています。--shop-code を指定してください。');
    process.exit(1);
  }

  // 店舗名必須チェック
  if (!shopName || typeof shopName !== 'string') {
    console.error('必須引数が不足しています。--shop-name を指定してください。');
    process.exit(1);
  }

  const config = buildConfigFromEnv();
  const route53 = new Route53Client({ region: config.region });

  const result = await handleEncodeName(
    { shopName, shopCode, testMode },
    route53,
    config,
  );

  if (!result.success) {
    console.error(result.error);
    process.exit(1);
  }

  console.log(`TXT レコード名: ${result.txtRecordName}`);
  console.log(`Base64 値: ${result.base64Value}`);
}

/**
 * create-records コマンドハンドラ
 * handlers.tsのhandleCreateRecordsを呼び出し、結果をコンソール出力する
 */
async function cliCreateRecords(args: Record<string, string | boolean>): Promise<void> {
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

  const config = buildConfigFromEnv();
  const route53 = new Route53Client({ region: config.region });

  const result = await handleCreateRecords(
    { shopCode, startIp, testMode },
    route53,
    config,
  );

  if (!result.success) {
    console.error(result.error);
    process.exit(1);
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
 * handlers.tsのhandleAddDeviceを呼び出し、結果をコンソール出力する
 */
async function cliAddDevice(args: Record<string, string | boolean>): Promise<void> {
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

  const config = buildConfigFromEnv();
  const route53 = new Route53Client({ region: config.region });

  const result = await handleAddDevice(
    { shopCode, device, ip, testMode },
    route53,
    config,
  );

  if (!result.success) {
    console.error(result.error);
    process.exit(1);
  }

  console.log(`CNAME レコード名: ${result.cnameRecordName}`);
  console.log(`エイリアス先: ${result.aliasTarget}`);
}

/**
 * undo コマンドハンドラ
 * handlers.tsのhandleUndoを呼び出し、結果をコンソール出力する
 */
async function cliUndo(): Promise<void> {
  const config = buildConfigFromEnv();
  const route53 = new Route53Client({ region: config.region });

  const result = await handleUndo(route53, config);

  if (!result.success) {
    console.log(result.message);
    return;
  }

  console.log(`\n${result.shopName}（${result.shopCode}）の登録を取り消します。\n`);
  console.log('レコードの取り消しが完了しました。');
}

/**
 * list-tests コマンドハンドラ
 * handlers.tsのhandleListTestsを呼び出し、結果をコンソール出力する
 */
async function cliListTests(): Promise<void> {
  const config = buildConfigFromEnv();
  const route53 = new Route53Client({ region: config.region });

  const result = await handleListTests(route53, config);

  if (result.totalCount === 0) {
    console.log('テストレコードが見つかりません。');
    return;
  }

  console.log('\n=== テストレコード一覧 ===');
  if (result.yamaokayaRecords.length > 0) {
    console.log(`\nyamaokaya.net（${result.yamaokayaRecords.length}件）:`);
    for (const r of result.yamaokayaRecords) {
      console.log(`  ${r.type}\t${r.name}\t→ ${r.value}`);
    }
  }
  if (result.menkataRecords.length > 0) {
    console.log(`\ninternal.menkata.me（${result.menkataRecords.length}件）:`);
    for (const r of result.menkataRecords) {
      console.log(`  ${r.type}\t${r.name}\t→ ${r.value}`);
    }
  }
  console.log('==========================\n');
}

/**
 * delete-tests コマンドハンドラ
 * handlers.tsのhandleDeleteTestsを呼び出し、結果をコンソール出力する
 */
async function cliDeleteTests(): Promise<void> {
  const config = buildConfigFromEnv();
  const route53 = new Route53Client({ region: config.region });

  const result = await handleDeleteTests(route53, config);

  if (result.deletedCount === 0 && result.failedCount === 0) {
    console.log('削除対象のテストレコードが見つかりません。');
    return;
  }

  // 確認メッセージ
  console.log('\nテスト用のデータを削除します。本番環境には影響しません。\n');

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
        await cliEncodeName(args);
        break;
      case 'create-records':
        await cliCreateRecords(args);
        break;
      case 'add-device':
        await cliAddDevice(args);
        break;
      case 'register':
        handleRegisterDeprecated();
        break;
      case 'undo':
        await cliUndo();
        break;
      case 'list-tests':
        await cliListTests();
        break;
      case 'delete-tests':
        await cliDeleteTests();
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
    // AWS認証エラー判定
    const authMessage = getAwsAuthErrorMessage(error);
    if (authMessage) {
      console.error(authMessage);
      process.exit(1);
    }

    // ネットワークエラー判定
    if (isNetworkError(error)) {
      console.error('インターネットに接続できません。ネットワーク接続を確認してください。');
      process.exit(1);
    }

    const message = error instanceof Error ? error.message : '予期しないエラーが発生しました。';
    console.error(message);
    process.exit(1);
  }
}

main();
