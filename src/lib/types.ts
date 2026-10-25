/** Shared UI-level types. */
export type BoardSize = 9 | 13 | 19
export type GameMode = 'selfplay' | 'ai'

/**
 * 수 번호 표시 모드 (놓아보기 전용):
 *  - 'hidden'      — 번호 없음 (기본값)
 *  - 'all'         — 현재 경로의 모든 착수를 1부터 번호
 *  - 'fromCurrent' — 선택한 노드(트리 상의 시작점)부터 1로 번호;
 *                    시작점이 현재 경로를 벗어나면 번호를 숨긴다
 */
export type MoveNumberMode = 'hidden' | 'all' | 'fromCurrent'
