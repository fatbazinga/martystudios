Put the sigil-matching font here:

  IMFellEnglishSC-Regular.ttf   (required)
  IMFellEnglishSC-Regular.woff2 (optional, smaller/faster)

Download free from Google Fonts: https://fonts.google.com/specimen/IM+Fell+English+SC
(SIL Open Font License, OK for commercial use and self-hosting.)
To make the .woff2:  pip install fonttools brotli
  python -m fontTools.ttLib.woff2 compress IMFellEnglishSC-Regular.ttf
