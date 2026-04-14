/**
 * Undo Manager
 * 登録情報の蓄積・読み込み・取り消し期限判定・クリーンアップを行う
 */

import fs from 'fs';
import path from 'path';
import { UndoEntry, UndoFile, LastRegistration } from './types';

/** 登録情報の保存先ファイルパス */
const UNDO_FILE = path.join(__dirname, '..', '.last-registration.json');

/** 一意の操作IDを生成する */
export function generateOperationId(): string {
  return `op_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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

/** undo情報ファイルを読み込む（前日以前のエントリは自動クリーンアップ） */
export function loadUndoEntries(): UndoEntry[] {
  if (!fs.existsSync(UNDO_FILE)) {
    return [];
  }
  try {
    const content = fs.readFileSync(UNDO_FILE, 'utf-8');
    const data = JSON.parse(content) as UndoFile;
    const entries = data.entries ?? [];

    // 前日以前のエントリをクリーンアップ
    const todayEntries = entries.filter((e) => isWithinUndoWindow(e.registeredAt));
    if (todayEntries.length !== entries.length) {
      saveUndoEntries(todayEntries);
    }
    return todayEntries;
  } catch {
    return [];
  }
}

/** undo情報ファイルに保存する */
export function saveUndoEntries(entries: UndoEntry[]): void {
  const data: UndoFile = { entries };
  fs.writeFileSync(UNDO_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

/** undo情報を追記する */
export function appendUndoEntry(entry: UndoEntry): void {
  const entries = loadUndoEntries();
  entries.push(entry);
  saveUndoEntries(entries);
}

/** 指定操作IDのundoneフラグをtrueに更新する */
export function markAsUndone(operationId: string): void {
  const entries = loadUndoEntries();
  const entry = entries.find((e) => e.operationId === operationId);
  if (entry) {
    entry.undone = true;
    saveUndoEntries(entries);
  }
}
