// ================================================
// FILE PATH (GitHub এ ঠিক এই path/নামে বসাবেন): pages/_document.js
// ================================================

import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="bn">
      <Head>
        <script src="https://telegram.org/js/telegram-web-app.js"></script>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
