/**
 * バグ条件探索テスト
 * 未修正コードに存在するバグを実証するためのテスト。
 * これらのテストは「期待される動作（修正後）」をアサートするため、
 * 未修正コードでは失敗する = バグの存在を証明する。
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 2.1, 2.2, 2.3
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
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

/**
 * テストレコードを含む ListResourceRecordSets レスポンスを生成するヘルパー
 */
function createListResponse(
  records: Array<{ name: string; type: string; value: string }>,
  isTruncated = false,
  nextRecordName?: string,
  nextRecordType?: string
) {
  return {
    ResourceRecordSets: records.map((r) => ({
      Name: `${r.name}.`,
      Type: r.type,
      TTL: 300,
      ResourceRecords: [{ Value: r.value }],
    })),
    IsTruncated: isTruncated,
    ...(nextRecordName && { NextRecordName: nextRecordName }),
    ...(nextRecordType && { NextRecordType: nextRecordType }),
  };
}

describe('バグ条件探索テスト', () => {
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
   * テスト1: deleteAllTestRecords が内部で listTestRecords を呼び出さないこと
   *
   * 期待される動作（修正後）: deleteAllTestRecords は事前取得済みレコードを
   * パラメータとして受け取り、内部で listTestRecords を再呼び出ししない。
   *
   * 未修正コードでの動作: deleteAllTestRecords(config) は内部で
   * listTestRecords を2回呼び出す（冗長な呼び出し）。
   *
   * Validates: Requirements 1.1, 2.1
   */
  it('deleteAllTestRecords は内部で listTestRecords を呼び出さないこと（冗長呼び出しの排除）', async () => {
    // テストレコードを含むレスポンスを設定
    const testRecords = [
      { name: 'auto_dns_test_001', type: 'A', value: '192.168.1.1' },
    ];

    // ListResourceRecordSetsCommand に対するレスポンス（listTestRecords 用）
    mockSend.mockImplementation((command: unknown) => {
      if (command instanceof ListResourceRecordSetsCommand) {
        return Promise.resolve(createListResponse(testRecords));
      }
      if (command instanceof ChangeResourceRecordSetsCommand) {
        return Promise.resolve({ ChangeInfo: { Id: 'change-1' } });
      }
      return Promise.resolve({});
    });

    // listTestRecords をスパイして呼び出し回数を記録
    const listSpy = vi.spyOn(testManager, 'listTestRecords');

    // 事前取得済みレコードを渡して deleteAllTestRecords を実行
    const preloadedRecords = {
      yamaokayaRecords: [{ name: 'auto_dns_test_001', type: 'A' as const, value: '192.168.1.1', ttl: 300 }],
      menkataRecords: [],
    };
    await testManager.deleteAllTestRecords(preloadedRecords, TEST_CONFIG);

    // 期待: deleteAllTestRecords 内部で listTestRecords が呼び出されないこと
    // 未修正コードでは listTestRecords が2回呼び出されるため、このテストは失敗する
    expect(listSpy.mock.calls.length).toBe(0);
  });

  /**
   * テスト2: listTestRecords は全レコードをスキャンしてテストレコードを収集すること
   *
   * Route53のDNS名ソート順はドメイン名の逆順（右から左）で行われるため、
   * StartRecordNameによるプレフィックス最適化は正しく動作しない。
   * 全レコードをスキャンしてテストプレフィックスに一致するレコードを収集する。
   *
   * Validates: Requirements 1.2, 2.2
   */
  it('listTestRecords は全レコードをスキャンしてテストレコードを収集すること', async () => {
    // テストレコードと通常レコードが混在するレスポンス
    mockSend.mockResolvedValue(
      createListResponse([
        { name: 's1105.yamaokaya.net', type: 'A', value: '192.168.1.1' },
        { name: 'auto_dns_test_s9999.yamaokaya.net', type: 'TXT', value: '"dGVzdA=="' },
      ])
    );

    const records = await testManager.listTestRecords(TEST_CONFIG.yamaokayaZoneId);

    // テストプレフィックスに一致するレコードのみ収集されること
    expect(records).toHaveLength(1);
    expect(records[0].name).toBe('auto_dns_test_s9999.yamaokaya.net');
    expect(records[0].type).toBe('TXT');
  });

  /**
   * テスト3: listTestRecords はページネーションで全ページをスキャンすること
   *
   * Route53のDNS名ソート順ではテストレコードがどのページに出現するか
   * 予測できないため、全ページをスキャンする必要がある。
   *
   * Validates: Requirements 1.3, 2.3
   */
  it('listTestRecords はページネーションで全ページをスキャンすること', async () => {
    // ページ1: 通常レコードのみ
    const page1 = createListResponse(
      [{ name: 's1105.yamaokaya.net', type: 'A', value: '192.168.1.1' }],
      true,
      'auto_dns_test_s9999.yamaokaya.net',
      'TXT'
    );

    // ページ2: テストレコードを含む
    const page2 = createListResponse(
      [{ name: 'auto_dns_test_s9999.yamaokaya.net', type: 'TXT', value: '"dGVzdA=="' }],
      false
    );

    mockSend
      .mockResolvedValueOnce(page1)
      .mockResolvedValueOnce(page2);

    const records = await testManager.listTestRecords(TEST_CONFIG.yamaokayaZoneId);

    // 全ページをスキャンしてテストレコードを収集すること
    expect(mockSend).toHaveBeenCalledTimes(2);
    expect(records).toHaveLength(1);
    expect(records[0].name).toBe('auto_dns_test_s9999.yamaokaya.net');
  });
});
