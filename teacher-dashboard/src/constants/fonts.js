export const FONT_OPTIONS = [
  { id: "Paperlogy", label: "Paperlogy (기본)", cssFamily: '"Paperlogy", sans-serif' },
  { id: "GangwonEduModu", label: "강원교육모두", cssFamily: '"GangwonEduModu", sans-serif' },
  { id: "Nanum Gothic", label: "나눔고딕", cssFamily: '"Nanum Gothic", sans-serif' },
  { id: "Gowun Dodum", label: "고운돋움", cssFamily: '"Gowun Dodum", sans-serif' },
  { id: "Gowun Batang", label: "고운바탕", cssFamily: '"Gowun Batang", serif' },
  { id: "Orbit", label: "Orbit", cssFamily: '"Orbit", sans-serif' },
  { id: "Diary", label: "다이어리체", cssFamily: '"Diary", cursive' },
  { id: "Gamja Flower", label: "감자꽃", cssFamily: '"Gamja Flower", cursive' },
  { id: "KOMACON", label: "만화진흥원체", cssFamily: '"KOMACON", sans-serif' },
  { id: "Okticon", label: "오케이티콘체", cssFamily: '"Okticon", cursive' },
]

export const DEFAULT_FONT = FONT_OPTIONS[0]

export const FONT_SIZE_PRESETS = Array.from({ length: 45 }, (_, i) => 12 + i * 2)

export function fontFamilyCss(fontId) {
  return FONT_OPTIONS.find((font) => font.id === fontId)?.cssFamily ?? DEFAULT_FONT.cssFamily
}
