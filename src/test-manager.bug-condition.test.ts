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
      { name: '__dns_auto_test-001', type: 'A', value: '192.168.1.1' },
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
      yamaokayaRecords: [{ name: '__dns_auto_test-001', type: 'A' as const, value: '192.168.1.1', ttl: 300 }],
      menkataRecords: [],
    };
    await testManager.deleteAllTestRecords(preloadedRecords, TEST_CONFIG);

    // 期待: deleteAllTestRecords 内部で listTestRecords が呼び出されないこと
    // 未修正コードでは listTestRecords が2回呼び出されるため、このテストは失敗する
    expect(listSpy.mock.calls.length).toBe(0);
  });

  /**
   * テスト2: listTestRecords が StartRecordName を指定すること
   *
   * 期待される動作（修正後）: ListResourceRecordSetsCommand に
   * StartRecordName: '__dns_auto_test-' を指定し、テストレコード付近から
   * スキャンを開始する。
   *
   * 未修正コードでの動作: StartRecordName が指定されず、ゾーン先頭から
   * フルスキャンが行われる。
   *
   * Validates: Requirements 1.2, 2.2
   */
  it('listTestRecords は ListResourceRecordSetsCommand に StartRecordName を指定すること', async () => {
    // テストレコードを含むレスポンスを設定
    mockSend.mockResolvedValue(
      createListResponse([
        { name: '__dns_auto_test-001', type: 'A', value: '192.168.1.1' },
      ])
    );

    await testManager.listTestRecords(TEST_CONFIG.yamaokayaZoneId);

    // send に渡されたコマンドを取得
    const sentCommand = mockSend.mock.calls[0][0] as ListResourceRecordSetsCommand;
    const input = sentCommand.input;

    // 期待: StartRecordName にテストプレフィックスが指定されていること
    // 未修正コードでは StartRecordName が未指定のため、このテストは失敗する
    expect(input.StartRecordName).toBe(TestRecordManager.TEST_PREFIX);
  });

  /**
   * テスト3: テストプレフィックス範囲外のレコード到達時にページネーションが終了すること
   *
   * 期待される動作（修正後）: テストプレフィックスに一致しないレコードが
   * 出現した時点でページネーションを即座に終了する。
   *
   * 未修正コードでの動作: IsTruncated が true である限り、テストプレフィックス
   * 範囲を超えてもページネーションが継続する（不要なページ取得）。
   *
   * Validates: Requirements 1.3, 2.3
   */
  it('テストプレフィックス範囲外のレコード到達時にページネーションが終了すること（早期終了）', async () => {
    // ページ1: テストレコードを含む（IsTruncated = true で次ページあり）
    const page1 = createListResponse(
      [{ name: '__dns_auto_test-001', type: 'A', value: '192.168.1.1' }],
      true,
      'other-record.example.com',
      'A'
    );

    // ページ2: テストプレフィックス範囲外のレコードのみ
    const page2 = createListResponse(
      [{ name: 'other-record.example.com', type: 'A', value: '10.0.0.1' }],
      true,
      'zzz-record.example.com',
      'A'
    );

    // ページ3: さらに範囲外のレコード（到達すべきでない）
    const page3 = createListResponse(
      [{ name: 'zzz-record.example.com', type: 'A', value: '10.0.0.2' }],
      false
    );

    mockSend
      .mockResolvedValueOnce(page1)
      .mockResolvedValueOnce(page2)
      .mockResolvedValueOnce(page3);

    await testManager.listTestRecords(TEST_CONFIG.yamaokayaZoneId);

    // 期待: ページ2でテストプレフィックス範囲外のレコードを検出し、
    // ページ3を取得せずにループを終了すること。
    // つまり send の呼び出し回数は最大2回（ページ1 + ページ2で早期終了）。
    // 未修正コードでは3回全て呼び出されるため、このテストは失敗する。
    expect(mockSend).toHaveBeenCalledTimes(2);
  });
});
