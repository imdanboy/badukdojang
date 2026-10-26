/** Shared UI-level types. */
export type BoardSize = 9 | 13 | 19
export type GameMode = 'selfplay' | 'ai'

/**
 * 수 번호 표시 모드 (놓아보기 전용):
 *  - 'hidden'      — 번호 없음 (기본값)
 *  - 'all'         — 현재 경로의 모든 착수를 1부터 번호 ("전체 수순")
 *  - 'fromCurrent' — 선택한 노드 "이후"의 착수만 1부터 번호 ("번호 표시");
 *                    누른 순간 이미 놓여 있던 돌은 라벨 없음.
 *                    시작점이 현재 경로를 벗어나면 번호를 숨긴다
 */
export type MoveNumberMode = 'hidden' | 'all' | 'fromCurrent'
