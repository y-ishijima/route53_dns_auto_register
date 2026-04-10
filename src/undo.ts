/**
 * Undo Manager
 * 直前の登録情報の保存・読み込み・取り消し期限判定を行う
 */

import fs from 'fs';
import path from 'path';
import { LastRegistration } from './types';

/** 登録情報の保存先ファイルパス */
const UNDO_FILE = path.join(process.cwd(), '.last-registration.json');

/** 直前の登録情報をファイルに保存する */
export function saveLastRegistration(data: LastRegistration): void {
  fs.writeFileSync(UNDO_FILE, JSON.stringify(data, null, 2));
}

/** 直前の登録情報をファイルから読み込む（存在しない場合はnull） */
export function loadLastRegistration(): LastRegistration | null {
  if (!fs.existsSync(UNDO_FILE)) {
    return null;
  }
  const content = fs.readFileSync(UNDO_FILE, 'utf-8');
  return JSON.parse(content) as LastRegistration;
}

/** 登録日時が取り消し可能かどうかを判定する（同日以内であれば取り消し可能） */
export function isWithinUndoWindow(registeredAt: string): boolean {
  const registeredDate = new Date(registeredAt);
  const now = new Date();
  return (
    registeredDate.getFullYear() === now.getFullYear() &&
    registeredDate.getMonth() === now.getMonth() &&
    registeredDate.getDate() === now.getDate()
  );
}
