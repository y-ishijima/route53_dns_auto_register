/**
 * Config_Loader
 * 設定ファイル（config.json）の読み込みと検証を行う
 */

import * as fs from 'fs';
import * as path from 'path';
import { Config } from './types';

/** 必須フィールド一覧 */
const REQUIRED_FIELDS = ['yamaokayaZoneId', 'menkataZoneId', 'region', 'aliases', 'ttl'] as const;

/**
 * 設定ファイルを読み込み、検証して返す
 * @param configPath 設定ファイルのパス（省略時はプロジェクトルートの config.json）
 */
export function loadConfig(configPath?: string): Config {
  const filePath = configPath ?? path.join(process.cwd(), 'config.json');

  // ファイル読み込み
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf-8');
  } catch {
    throw new Error(`設定ファイルが見つかりません: ${filePath}`);
  }

  // JSONパース
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`設定ファイルの形式が不正です: ${filePath}`);
  }

  const config = parsed as Record<string, unknown>;

  // 必須フィールドチェック
  for (const field of REQUIRED_FIELDS) {
    if (config[field] === undefined || config[field] === null) {
      throw new Error(`設定ファイルに必須フィールドが不足しています: ${field}`);
    }
  }

  // エイリアス定義が空でないことを確認
  const aliases = config.aliases;
  if (!Array.isArray(aliases) || aliases.length === 0) {
    throw new Error('機器タイプが設定されていません。IT部門に連絡してください。');
  }

  return config as unknown as Config;
}
