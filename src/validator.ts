/**
 * Input_Validator
 * ユーザ入力（店舗名、店舗コード、先頭IPアドレス、機器IPアドレス）の妥当性を検証する
 */

import { ValidationResult, AliasDefinition } from './types';

/** 店舗名の許可文字パターン（漢字・ひらがな・カタカナ・英数字・スペース・長音記号・中黒） */
const SHOP_NAME_PATTERN = /^[\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FFa-zA-Z0-9\uFF21-\uFF3A\uFF41-\uFF5A\uFF10-\uFF19\s\u3000\u30FC\u30FB]+$/;

/** 店舗コードパターン（s + 数字1〜6桁） */
const SHOP_CODE_PATTERN = /^s\d{1,6}$/;

/** IPv4アドレスパターン（192.168.x.x） */
const IP_PATTERN = /^192\.168\.(\d{1,3})\.(\d{1,3})$/;

/**
 * 店舗名を検証する
 * - 1〜30文字
 * - 許可文字種のみ（制御文字、HTMLタグ、スクリプト等は拒否）
 */
export function validateShopName(name: string): ValidationResult {
  if (!name || name.length === 0) {
    return { valid: false, error: '店舗名が入力されていません。' };
  }
  if (name.length > 30) {
    return { valid: false, error: '店舗名は30文字以内で入力してください。' };
  }
  if (!SHOP_NAME_PATTERN.test(name)) {
    return { valid: false, error: '店舗名に使用できない文字が含まれています。漢字、ひらがな、カタカナ、英数字、スペース、長音記号（ー）、中黒（・）のみ使用できます。' };
  }
  return { valid: true };
}

/**
 * 店舗コードを検証する
 * - s + 数字1〜6桁
 */
export function validateShopCode(code: string): ValidationResult {
  if (!SHOP_CODE_PATTERN.test(code)) {
    return { valid: false, error: '店舗コードが正しくありません。s + 数字1〜6桁で入力してください。' };
  }
  return { valid: true };
}

/**
 * IPアドレス文字列をパースして各オクテットを返す
 * 192.168.x.x 形式でない場合は null を返す
 */
function parseIp(ip: string): { oct3: number; oct4: number } | null {
  const match = IP_PATTERN.exec(ip);
  if (!match) return null;
  const oct3 = parseInt(match[1], 10);
  const oct4 = parseInt(match[2], 10);
  if (oct3 > 255 || oct4 > 255) return null;
  return { oct3, oct4 };
}

/**
 * 先頭IPアドレスを検証する
 * - 192.168.x.x 形式
 * - 第4オクテット + 61 <= 254（サブネット境界チェック）
 */
export function validateStartIp(ip: string): ValidationResult {
  const parsed = parseIp(ip);
  if (!parsed) {
    return { valid: false, error: 'IPアドレスが正しくありません。192.168.x.x の形式で入力してください。' };
  }
  if (parsed.oct4 + 61 > 254) {
    return { valid: false, error: 'このIPアドレスでは62件のレコードを作成できません。別のIPアドレスを指定してください。' };
  }
  return { valid: true };
}

/**
 * 機器IPアドレスを検証する
 * - 各機器IPが先頭IPからの62件の範囲内であること
 * - 重複IPがないこと
 * - 未入力がないこと
 */
export function validateDeviceIps(
  devices: Record<string, string>,
  startIp: string,
  aliases: AliasDefinition[]
): ValidationResult {
  const startParsed = parseIp(startIp);
  if (!startParsed) {
    return { valid: false, error: '先頭IPアドレスが不正です。' };
  }

  const { oct3: startOct3, oct4: startOct4 } = startParsed;

  // エイリアス定義からdisplayName取得用マップ
  const aliasMap = new Map(aliases.map(a => [a.type, a.displayName]));

  // IP重複チェック用マップ（IP → 機器タイプ）
  const ipToDevice = new Map<string, string>();

  for (const [deviceType, deviceIp] of Object.entries(devices)) {
    const displayName = aliasMap.get(deviceType) ?? deviceType;

    // 未入力チェック
    if (!deviceIp || deviceIp.trim() === '') {
      return { valid: false, error: `${displayName}のIPアドレスが入力されていません。` };
    }

    // 範囲チェック
    const deviceParsed = parseIp(deviceIp);
    if (!deviceParsed) {
      return { valid: false, error: `${displayName}のIPアドレスが先頭IPの範囲外です。` };
    }

    const { oct3: devOct3, oct4: devOct4 } = deviceParsed;
    if (devOct3 !== startOct3 || devOct4 < startOct4 || devOct4 > startOct4 + 61) {
      return { valid: false, error: `${displayName}のIPアドレスが先頭IPの範囲外です。` };
    }

    // 重複チェック
    const existing = ipToDevice.get(deviceIp);
    if (existing) {
      const existingDisplayName = aliasMap.get(existing) ?? existing;
      return { valid: false, error: `${existingDisplayName}と${displayName}のIPアドレスが同じです。` };
    }
    ipToDevice.set(deviceIp, deviceType);
  }

  return { valid: true };
}
