시엘 AAC PWA 이미지 강제 고정 수정 버전

버전: sielPwaHardImageFix20260628

수정 내용:
- 설치 앱(PWA)에서만 이미지가 위쪽만 보이는 문제를 피하기 위해 이미지 영역/글씨 영역을 absolute 방식으로 강제 분리했습니다.
- JS에서도 카드 높이를 계산해 이미지 영역을 직접 px로 재설정합니다.
- 기존 grid/flex 높이 계산 문제를 우회합니다.

적용 후 접속:
https://siel-aac.netlify.app/?v=sielPwaHardImageFix20260628

권장:
기존 홈화면 앱 삭제 → 위 주소로 접속 → 홈 화면에 추가/앱 설치를 다시 해 주세요.
