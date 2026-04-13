/**
 * 共通型定義
 * Route53 DNS自動登録ツールで使用するインターフェースを定義する
 */

/** エイリアス定義（機器タイプと日本語表示名） */
export interface AliasDefinition {
  /** 機器タイプ名（例: "rt"） */
  type: string;
  /** 日本語表示名（例: "ルーター"） */
  displayName: string;
}

/** 設定ファイル（config.json）の構造 */
export interface Config {
  /** yamaokaya.net ホストゾーンID */
  yamaokayaZoneId: string;
  /** internal.menkata.me ホストゾーンID */
  menkataZoneId: string;
  /** AWSリージョン */
  region: string;
  /** エイリアス定義リスト */
  aliases: AliasDefinition[];
  /** TTL設定 */
  ttl: {
    /** Aレコード用TTL（デフォルト: 300） */
    aRecord: number;
    /** CNAMEエイリアス用TTL（デフォルト: 3600） */
    cnameAlias: number;
    /** internal.menkata.me用CNAME TTL（デフォルト: 300） */
    menkataCname: number;
  };
}

/** DNSレコード定義 */
export interface DnsRecord {
  /** FQDN */
  name: string;
  /** レコードタイプ */
  type: 'A' | 'CNAME' | 'TXT';
  /** IPアドレスまたはCNAME参照先 */
  value: string;
  /** TTL値 */
  ttl: number;
}

/** 生成されたレコード群 */
export interface GeneratedRecords {
  /** yamaokaya.net Aレコード（62件） */
  yamaokayaARecords: DnsRecord[];
  /** yamaokaya.net CNAMEエイリアス（機器数分） */
  yamaokayaCnameAliases: DnsRecord[];
  /** internal.menkata.me CNAMEレコード（62件） */
  menkataCnameRecords: DnsRecord[];
}

/** バリデーション結果 */
export interface ValidationResult {
  /** 検証成功かどうか */
  valid: boolean;
  /** 日本語エラーメッセージ */
  error?: string;
}

/** レコード登録結果 */
export interface RegistrationResult {
  /** 登録成功かどうか */
  success: boolean;
  /** yamaokaya.net の Change ID */
  yamaokayaChangeId?: string;
  /** internal.menkata.me の Change ID */
  menkataChangeId?: string;
  /** 登録レコード件数 */
  recordCount: number;
  /** エラーメッセージ */
  error?: string;
}

/** 直前の登録情報（undo用） */
export interface LastRegistration {
  /** 店舗コード */
  shopCode: string;
  /** 店舗名 */
  shopName: string;
  /** 登録日時（ISO 8601） */
  registeredAt: string;
  /** 登録したレコード群 */
  records: GeneratedRecords;
}

/** encode-name ハンドラの入力 */
export interface EncodeNameParams {
  shopName: string;
  shopCode: string;
  testMode: boolean;
}

/** encode-name ハンドラの出力 */
export interface EncodeNameResult {
  success: boolean;
  txtRecordName?: string;
  base64Value?: string;
  error?: string;
}

/** create-records ハンドラの入力 */
export interface CreateRecordsParams {
  shopCode: string;
  startIp: string;
  testMode: boolean;
}

/** create-records ハンドラの出力 */
export interface CreateRecordsResult {
  success: boolean;
  recordCount?: number;
  yamaokayaChangeId?: string;
  menkataChangeId?: string;
  error?: string;
}

/** add-device ハンドラの入力 */
export interface AddDeviceParams {
  shopCode: string;
  device: string;
  ip: string;
  testMode: boolean;
}

/** add-device ハンドラの出力 */
export interface AddDeviceResult {
  success: boolean;
  cnameRecordName?: string;
  aliasTarget?: string;
  error?: string;
}

/** undo ハンドラの出力 */
export interface UndoResult {
  success: boolean;
  message: string;
  shopCode?: string;
  shopName?: string;
}

/** list-tests ハンドラの出力 */
export interface ListTestsResult {
  yamaokayaRecords: DnsRecord[];
  menkataRecords: DnsRecord[];
  totalCount: number;
}

/** delete-tests ハンドラの出力 */
export interface DeleteTestsResult {
  deletedCount: number;
  failedCount: number;
  failures: Array<{ name: string; reason: string }>;
}
