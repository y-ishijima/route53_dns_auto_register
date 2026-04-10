/**
 * Record_Generator
 * 店舗コードと先頭IPアドレスからDNSレコード定義を生成する
 */

import { Config, DnsRecord, GeneratedRecords } from './types';

/** 1店舗あたりのレコード数（サブネットマスク /26） */
const RECORD_COUNT = 62;

/** 数値を3桁ゼロパディングする */
const pad3 = (n: number): string => String(n).padStart(3, '0');

/**
 * DNSレコード定義を生成する
 * @param shopCode 店舗コード
 * @param startIp 先頭IPアドレス（192.168.x.x）
 * @param devices 機器タイプとIPアドレスのマップ
 * @param config 設定情報
 * @param testPrefix テストモード時のプレフィックス
 */
export function generateRecords(
  shopCode: string,
  startIp: string,
  devices: Record<string, string>,
  config: Config,
  testPrefix?: string
): GeneratedRecords {
  const parts = startIp.split('.');
  const oct3 = parseInt(parts[2], 10);
  const oct4 = parseInt(parts[3], 10);
  const prefix = testPrefix ?? '';

  // yamaokaya.net Aレコード 62件
  const yamaokayaARecords: DnsRecord[] = [];
  for (let i = 0; i < RECORD_COUNT; i++) {
    const ip = `192.168.${oct3}.${oct4 + i}`;
    const name = `${prefix}ip192-168-${pad3(oct3)}-${pad3(oct4 + i)}.${shopCode}.yamaokaya.net`;
    yamaokayaARecords.push({ name, type: 'A', value: ip, ttl: config.ttl.aRecord });
  }

  // IPアドレスからAレコード名への逆引きマップ
  const ipToAName = new Map<string, string>();
  for (const rec of yamaokayaARecords) {
    ipToAName.set(rec.value, rec.name);
  }

  // yamaokaya.net CNAMEエイリアス（機器数分）
  const yamaokayaCnameAliases: DnsRecord[] = [];
  for (const [deviceType, deviceIp] of Object.entries(devices)) {
    const aRecordName = ipToAName.get(deviceIp)!;
    const name = `${prefix}${deviceType}.${shopCode}.yamaokaya.net`;
    yamaokayaCnameAliases.push({ name, type: 'CNAME', value: aRecordName, ttl: config.ttl.cnameAlias });
  }

  // internal.menkata.me CNAMEレコード 62件
  const menkataCnameRecords: DnsRecord[] = [];
  for (let i = 0; i < RECORD_COUNT; i++) {
    const aName = yamaokayaARecords[i].name;
    const name = `${prefix}ip192-168-${pad3(oct3)}-${pad3(oct4 + i)}.internal.menkata.me`;
    menkataCnameRecords.push({ name, type: 'CNAME', value: aName, ttl: config.ttl.menkataCname });
  }

  // 生成件数の検証
  const expectedTotal = RECORD_COUNT + Object.keys(devices).length + RECORD_COUNT;
  const actualTotal = yamaokayaARecords.length + yamaokayaCnameAliases.length + menkataCnameRecords.length;
  if (actualTotal !== expectedTotal) {
    throw new Error('レコードの生成に問題が発生しました。IT部門に連絡してください。');
  }

  return { yamaokayaARecords, yamaokayaCnameAliases, menkataCnameRecords };
}
