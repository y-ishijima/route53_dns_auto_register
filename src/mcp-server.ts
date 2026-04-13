#!/usr/bin/env node

/**
 * MCPサーバーエントリポイント
 * stdioトランスポートでClaude DesktopからRoute53 APIへの直接通信パスを提供する
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { Route53Client } from '@aws-sdk/client-route-53';
import { existsSync } from 'fs';
import { resolve } from 'path';

import { loadEnvFile, buildConfigFromEnv, getAwsAuthErrorMessage, isNetworkError } from './cli.js';
import {
  handleEncodeName,
  handleCreateRecords,
  handleAddDevice,
  handleUndo,
  handleListTests,
  handleDeleteTests,
} from './handlers.js';

/**
 * ハンドラ結果をMCPレスポンス形式に変換する
 * success: falseの場合はisError: trueで返却する
 */
function toMcpResponse(result: Record<string, unknown>) {
  const text = JSON.stringify(result, null, 2);

  if (result.success === false) {
    const errorText = (result.error ?? result.message ?? '不明なエラー') as string;
    return {
      content: [{ type: 'text' as const, text: errorText }],
      isError: true,
    };
  }

  return {
    content: [{ type: 'text' as const, text }],
  };
}

/**
 * AWS/ネットワークエラーをMCPレスポンスに変換する
 */
function handleAwsError(error: unknown) {
  const authMessage = getAwsAuthErrorMessage(error);
  if (authMessage) {
    return {
      content: [{ type: 'text' as const, text: authMessage }],
      isError: true,
    };
  }

  if (isNetworkError(error)) {
    return {
      content: [{ type: 'text' as const, text: 'インターネットに接続できません。ネットワーク接続を確認してください。' }],
      isError: true,
    };
  }

  const message = error instanceof Error ? error.message : '予期しないエラーが発生しました。';
  return {
    content: [{ type: 'text' as const, text: message }],
    isError: true,
  };
}

/** MCPサーバーのメインエントリポイント */
async function main(): Promise<void> {
  // .envファイルからAWS認証情報を読み込む
  const envPath = resolve(process.cwd(), '.env');
  if (!existsSync(envPath)) {
    console.error('.envファイルが見つかりません。');
    process.exit(1);
  }
  loadEnvFile(envPath);

  // Config構築とRoute53Client初期化
  const config = buildConfigFromEnv();
  const route53Client = new Route53Client({ region: config.region });

  // MCPサーバー作成
  const server = new McpServer({
    name: 'dns-register',
    version: '2.0.0',
  });

  // encode-name ツール登録
  server.tool(
    'encode-name',
    '店舗名TXTレコード登録: 店舗名（平文）をUTF-8 Base64エンコードし、TXTレコードとして登録する',
    {
      shop_name: z.string().describe('店舗名（日本語の平文）'),
      shop_code: z.string().describe('店舗コード（s + 数字1-6桁、例: s123）'),
      test_mode: z.boolean().optional().default(false).describe('テストモード（true: UPSERTでプレフィックス付与）'),
    },
    async ({ shop_name, shop_code, test_mode }) => {
      try {
        const result = await handleEncodeName(
          { shopName: shop_name, shopCode: shop_code, testMode: test_mode },
          route53Client,
          config,
        );
        return toMcpResponse(result as unknown as Record<string, unknown>);
      } catch (error) {
        return handleAwsError(error);
      }
    },
  );

  // create-records ツール登録
  server.tool(
    'create-records',
    'Aレコード62件+menkata CNAME62件一括登録: 店舗コードと先頭IPアドレスからDNSレコードを一括登録する',
    {
      shop_code: z.string().describe('店舗コード（s + 数字1-6桁、例: s123）'),
      start_ip: z.string().describe('先頭IPアドレス（192.168.x.x形式）'),
      test_mode: z.boolean().optional().default(false).describe('テストモード（true: UPSERTでプレフィックス付与）'),
    },
    async ({ shop_code, start_ip, test_mode }) => {
      try {
        const result = await handleCreateRecords(
          { shopCode: shop_code, startIp: start_ip, testMode: test_mode },
          route53Client,
          config,
        );
        return toMcpResponse(result as unknown as Record<string, unknown>);
      } catch (error) {
        return handleAwsError(error);
      }
    },
  );

  // add-device ツール登録
  server.tool(
    'add-device',
    '機器CNAMEエイリアス登録: 店舗コード、機器タイプ、IPアドレスからCNAMEレコードを登録する',
    {
      shop_code: z.string().describe('店舗コード（s + 数字1-6桁、例: s123）'),
      device: z.string().describe('機器タイプ名（例: rt, pc01）'),
      ip: z.string().describe('IPアドレス（192.168.x.x形式）'),
      test_mode: z.boolean().optional().default(false).describe('テストモード（true: UPSERTでプレフィックス付与）'),
    },
    async ({ shop_code, device, ip, test_mode }) => {
      try {
        const result = await handleAddDevice(
          { shopCode: shop_code, device, ip, testMode: test_mode },
          route53Client,
          config,
        );
        return toMcpResponse(result as unknown as Record<string, unknown>);
      } catch (error) {
        return handleAwsError(error);
      }
    },
  );

  // undo ツール登録
  server.tool(
    'undo',
    '直前の登録取り消し: 直前に登録したDNSレコードを削除する',
    async () => {
      try {
        const result = await handleUndo(route53Client, config);
        return toMcpResponse(result as unknown as Record<string, unknown>);
      } catch (error) {
        return handleAwsError(error);
      }
    },
  );

  // list-tests ツール登録
  server.tool(
    'list-tests',
    'テストレコード一覧取得: 両ゾーンのテストレコード一覧を取得する',
    async () => {
      try {
        const result = await handleListTests(route53Client, config);
        return toMcpResponse(result as unknown as Record<string, unknown>);
      } catch (error) {
        return handleAwsError(error);
      }
    },
  );

  // delete-tests ツール登録
  server.tool(
    'delete-tests',
    'テストレコード一括削除: 両ゾーンのテストレコードを一括削除する',
    async () => {
      try {
        const result = await handleDeleteTests(route53Client, config);
        return toMcpResponse(result as unknown as Record<string, unknown>);
      } catch (error) {
        return handleAwsError(error);
      }
    },
  );

  // StdioServerTransportで接続
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('MCPサーバーの起動に失敗しました:', error);
  process.exit(1);
});
