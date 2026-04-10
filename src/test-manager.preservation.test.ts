/**
 * 保全プロパティテスト（修正実装前）
 * 未修正コードのベースライン動作をキャプチャする。
 * これらのテストは未修正コードで成功すること。
 *
 * Property 3: 保全 - レコード取得結果の同一性
 * Property 4: 保全 - 削除結果オブジェクトの形式と正確性
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { TestRecordManager } from './test-manager.js';
import {
  Route53Client,
  ListResourceRecordSetsCommand,
  ChangeResourceRecordSetsCommand,
} from '@aws-sdk/client-route-53';
import type { Config } from './types.js';

// Route53Client の send メソッドをモック化
vi.mock('@aws-sdk/client-route-53', async () => {
  const actual = await vi.importActual<typeof import('@aws-sdk/client-route-53')>(
    '@aws-sdk/client-route-53'
  );
  return {
    ...actual,
    Route53Client: vi.fn().mockImplementation(() => ({
      send: vi.fn(),
    })),
  };
});

/** テスト用の Config オブジェクト */
const TEST_CONFIG: Config = {
  yamaokayaZoneId: 'Z_YAMAOKAYA_TEST',
  menkataZoneId: 'Z_MENKATA_TEST',
  region: 'ap-northeast-1',
  aliases: [],
  ttl: { aRecord: 300, cnameAlias: 3600, menkataCname: 300 },
};

/** テストプレフィックス */
const TEST_PREFIX = '__dns_auto_test-';

// --- fast-check アービトラリ定義 ---

/** テストレコード名を生成するアービトラリ（__dns_auto_test- プレフィックス付き） */
const testRecordNameArb = fc.stringMatching(/^[a-z0-9][a-z0-9-]{0,20}$/).map(
  (suffix) => `${TEST_PREFIX}${suffix}`
);

/** 本番レコード名を生成するアービトラリ（テストプレフィックスを持たない） */
const productionRecordNameArb = fc.stringMatching(/^[a-z][a-z0-9.-]{1,30}\.[a-z]{2,6}$/).filter(
  (name) => !name.startsWith(TEST_PREFIX)
);

/** レコードタイプのアービトラリ */
const recordTypeArb = fc.constantFrom('A' as const, 'CNAME' as const);

/** IPv4アドレスのアービトラリ */
const ipv4Arb = fc.tuple(
  fc.integer({ min: 1, max: 254 }),
  fc.integer({ min: 0, max: 255 }),
  fc.integer({ min: 0, max: 255 }),
  fc.integer({ min: 1, max: 254 }),
).map(([a, b, c, d]) => `${a}.${b}.${c}.${d}`);

/** TTL値のアービトラリ */
const ttlArb = fc.constantFrom(60, 300, 600, 3600);

/** テストDNSレコードのアービトラリ */
const testDnsRecordArb = fc.tuple(testRecordNameArb, recordTypeArb, ipv4Arb, ttlArb).map(
  ([name, type, value, ttl]) => ({ name, type, value, ttl })
);

/** 本番DNSレコードのアービトラリ */
const productionDnsRecordArb = fc.tuple(productionRecordNameArb, recordTypeArb, ipv4Arb, ttlArb).map(
  ([name, type, value, ttl]) => ({ name, type, value, ttl })
);

/** ゾーン内レコード構成のアービトラリ（テスト + 本番レコードの混在） */
const zoneRecordsArb = fc.tuple(
  fc.array(testDnsRecordArb, { minLength: 0, maxLength: 10 }),
  fc.array(productionDnsRecordArb, { minLength: 0, maxLength: 10 }),
);

/**
 * ListResourceRecordSets レスポンスを生成するヘルパー
 * レコード配列からRoute53 APIレスポンス形式に変換する
 */
function createListResponse(
  records: Array<{ name: string; type: string; value: string; ttl: number }>,
  isTruncated = false,
  nextRecordName?: string,
  nextRecordType?: string,
) {
  return {
    ResourceRecordSets: records.map((r) => ({
      Name: `${r.name}.`,
      Type: r.type,
      TTL: r.ttl,
      ResourceRecords: [{ Value: r.value }],
    })),
    IsTruncated: isTruncated,
    ...(nextRecordName && { NextRecordName: nextRecordName }),
    ...(nextRecordType && { NextRecordType: nextRecordType }),
  };
}

describe('保全プロパティテスト（修正実装前）', () => {
  let mockSend: ReturnType<typeof vi.fn>;
  let route53Client: Route53Client;
  let testManager: TestRecordManager;

  beforeEach(() => {
    vi.clearAllMocks();
    route53Client = new Route53Client({ region: 'ap-northeast-1' });
    mockSend = route53Client.send as ReturnType<typeof vi.fn>;
    testManager = new TestRecordManager(route53Client);
  });

  /**
   * プロパティ1: 任意のゾーン内レコード構成に対して、listTestRecords は
   * __dns_auto_test- プレフィックス付きレコードのみを返し、それ以外を含まないこと
   *
   * **Validates: Requirements 3.2, 3.3**
   */
  it('listTestRecords はテストプレフィックス付きレコードのみを返し、本番レコードを含まないこと', async () => {
    await fc.assert(
      fc.asyncProperty(zoneRecordsArb, async ([testRecords, productionRecords]) => {
        // モックをリセット
        mockSend.mockReset();

        // テストレコードと本番レコードを混在させたレスポンスを構築
        // Route53はアルファベット順にソートして返すため、ソートする
        const allRecords = [...testRecords, ...productionRecords].sort((a, b) =>
          a.name.localeCompare(b.name)
        );

        // 単一ページレスポンスとしてモック設定
        mockSend.mockResolvedValue(createListResponse(allRecords));

        // listTestRecords を実行
        const result = await testManager.listTestRecords(TEST_CONFIG.yamaokayaZoneId);

        // 検証1: 返されたレコードは全てテストプレフィックスを持つこと
        for (const record of result) {
          expect(record.name.startsWith(TEST_PREFIX)).toBe(true);
        }

        // 検証2: 本番レコードが結果に含まれないこと
        const resultNames = new Set(result.map((r) => r.name));
        for (const prodRecord of productionRecords) {
          expect(resultNames.has(prodRecord.name)).toBe(false);
        }

        // 検証3: テストレコードが全て結果に含まれること
        for (const testRecord of testRecords) {
          const found = result.some(
            (r) => r.name === testRecord.name && r.value === testRecord.value
          );
          expect(found).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * プロパティ2: 任意のレコード配列に対して、deleteAllTestRecords の
   * deletedCount + failedCount が入力レコード総数と一致すること
   *
   * 新シグネチャ deleteAllTestRecords(records, config) をテストする。
   * 事前取得済みレコードを直接渡して結果を検証する。
   *
   * **Validates: Requirements 3.4, 3.5**
   */
  it('deleteAllTestRecords の deletedCount + failedCount が入力レコード総数と一致すること', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(testDnsRecordArb, { minLength: 1, maxLength: 8 }),
        fc.array(testDnsRecordArb, { minLength: 0, maxLength: 8 }),
        fc.boolean(),
        async (yamaokayaRecords, menkataRecords, shouldFail) => {
          // モックをリセット
          mockSend.mockReset();

          // 新シグネチャでは listTestRecords は呼び出されないため、
          // ChangeResourceRecordSetsCommand のみモック設定
          mockSend.mockImplementation((command: unknown) => {
            if (command instanceof ChangeResourceRecordSetsCommand) {
              if (shouldFail) {
                return Promise.reject(new Error('API削除エラー'));
              }
              return Promise.resolve({ ChangeInfo: { Id: 'change-1' } });
            }
            return Promise.resolve({});
          });

          // console.log を抑制
          const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

          // 事前取得済みレコードを渡して deleteAllTestRecords を実行
          const preloadedRecords = {
            yamaokayaRecords: yamaokayaRecords.map((r) => ({
              name: r.name,
              type: r.type as 'A' | 'CNAME',
              value: r.value,
              ttl: r.ttl,
            })),
            menkataRecords: menkataRecords.map((r) => ({
              name: r.name,
              type: r.type as 'A' | 'CNAME',
              value: r.value,
              ttl: r.ttl,
            })),
          };
          const result = await testManager.deleteAllTestRecords(preloadedRecords, TEST_CONFIG);

          consoleSpy.mockRestore();

          const totalInputRecords = yamaokayaRecords.length + menkataRecords.length;

          // 検証: deletedCount + failedCount が入力レコード総数と一致すること
          expect(result.deletedCount + result.failedCount).toBe(totalInputRecords);

          // 検証: 結果オブジェクトの形式が正しいこと
          expect(result).toHaveProperty('deletedCount');
          expect(result).toHaveProperty('failedCount');
          expect(result).toHaveProperty('failures');
          expect(Array.isArray(result.failures)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * プロパティ3: 空レコード配列を渡した場合、deletedCount: 0, failedCount: 0 が返されること
   *
   * 両ゾーンにテストレコードが存在しない場合の動作を検証する。
   *
   * **Validates: Requirements 3.1, 3.5**
   */
  it('テストレコードが存在しない場合、deletedCount: 0, failedCount: 0 が返されること', async () => {
    await fc.assert(
      fc.asyncProperty(
        // 空でないゾーンIDを生成（任意の文字列だが、動作に影響しない）
        fc.stringMatching(/^Z_[A-Z]{3,10}$/),
        fc.stringMatching(/^Z_[A-Z]{3,10}$/),
        async (yamaokayaZoneId, menkataZoneId) => {
          // モックをリセット
          mockSend.mockReset();

          const config: Config = {
            ...TEST_CONFIG,
            yamaokayaZoneId,
            menkataZoneId,
          };

          // console.log を抑制
          const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

          // 空レコードを渡して deleteAllTestRecords を実行
          const emptyRecords = {
            yamaokayaRecords: [] as Array<{ name: string; type: 'A' | 'CNAME'; value: string; ttl: number }>,
            menkataRecords: [] as Array<{ name: string; type: 'A' | 'CNAME'; value: string; ttl: number }>,
          };
          const result = await testManager.deleteAllTestRecords(emptyRecords, config);

          consoleSpy.mockRestore();

          // 検証: 空レコード時は deletedCount: 0, failedCount: 0
          expect(result.deletedCount).toBe(0);
          expect(result.failedCount).toBe(0);
          expect(result.failures).toEqual([]);
        },
      ),
      { numRuns: 100 },
    );
  });
});
