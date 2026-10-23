# Carlito

Carattere dei PDF dei piani nutrizionali: ha le stesse metriche di Calibri, il carattere usato nei piani di riferimento.
Licenza: SIL Open Font License 1.1 (vedi `OFL.txt`). Fonte: https://github.com/googlefonts/carlito

I file sono ridotti ai caratteri latini (≈30–50 KB ciascuno invece di ≈700 KB), così i PDF restano leggeri.
Per rigenerarli dai file originali (pacchetto `fonts-crosextra-carlito`, Debian/Ubuntu):

```sh
pip install fonttools
for f in Regular Bold Italic BoldItalic; do
  pyftsubset /usr/share/fonts/truetype/crosextra/Carlito-$f.ttf \
    --unicodes="U+0020-007E,U+00A0-017F,U+2010-2027,U+2030-203A,U+20AC,U+2122,U+2190-2193,U+2212,U+2264-2265" \
    --layout-features='' --no-hinting --drop-tables+=DSIG,GDEF,GPOS,GSUB \
    --output-file=Carlito-$f.ttf
done
```
