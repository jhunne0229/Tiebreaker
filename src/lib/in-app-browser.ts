// 메신저/SNS 앱의 임베디드 웹뷰 감지 — Google OAuth 가 "Disallowed user agent" 로 막는 환경.
// 매칭되면 /login 페이지에서 안내 화면으로 분기.
const IN_APP_PATTERNS = [
  /KAKAOTALK/i,
  /FB_IAB|FBAN|FBAV/i, // Facebook / Messenger
  /Instagram/i,
  /Line\//i,
  /NAVER\(inapp/i,
  /MicroMessenger/i, // WeChat
  /TwitterAndroid|Twitter for/i,
  /everytimeapp/i,
  /DaumApps/i,
  /; wv\)/i, // 일반 Android WebView 표시
];

export function isInAppBrowser(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false;
  return IN_APP_PATTERNS.some((p) => p.test(userAgent));
}
