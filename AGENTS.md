# AGENTS.md — badukdojang 프로젝트 부트스트랩

이 프로젝트는 `docs/` 에 LLM-위키를 두고 있다.
작업 전 아래 규칙을 반드시 따른다.

## 진입점
- **`docs/index.md` = MOC (Map of Content)**. 항상 여기부터.
  각 노트의 frontmatter `description`(~80자)이 한 줄씩 모여 있다.
- 본문을 읽기 전에 **MOC 의 description 으로 후보를 좁히고**,
  꼭 필요한 노트만 본문을 read 한다.

## 노트 규칙 (요약)
- 모든 노트엔 frontmatter 있음: `title/description/tags/created/updated`.
- 새 노트는 frontmatter 부터, `description` 정확히. 파일명 kebab-case.
- `docs/_TEMPLATE.md` 를 참조할 것.

## 금지
- MOC 를 무시하고 `docs/` 전체를 grep/read 하지 말 것.
