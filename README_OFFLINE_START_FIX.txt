시엘 AAC 오프라인 실행 시작 주소 수정 버전

버전: sielOfflineStartFix20260628

수정 내용:
- 홈화면 앱이 예전 ?v= 주소를 열어도 오프라인에서 index.html 캐시로 실행되도록 Service Worker navigation fallback을 추가했습니다.
- manifest start_url을 './'로 고정해 홈화면 아이콘이 특정 과거 버전에 묶이지 않게 했습니다.
- 온라인에서 한 번 정상 접속하면 이후 Wi-Fi 없이도 앱 화면이 열리도록 보강했습니다.

적용 후 접속:
https://siel-aac.netlify.app/?v=sielOfflineStartFix20260628

중요 순서:
1. Wi-Fi 켠 상태에서 위 주소로 접속
2. 새로고침 2번
3. 홈화면 기존 아이콘 삭제
4. 다시 홈 화면에 추가/앱 설치
5. 앱을 한 번 실행해서 화면과 그림을 다 보이게 하기
6. 그 다음 Wi-Fi를 끄고 실행 테스트
