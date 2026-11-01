# Dovşan Qaçışı 🐇

Chrome-un T-Rex (Dino) oyununun hərəkət modeli ilə hazırlanmış kiçik brauzer oyunu.
Dovşan çəmənlikdə qaçır, torpaqdan çıxan kök bitkilərin (yerkökü, turp, çuğundur) üstündən tullanır.

## İdarəetmə
| Düymə | Nə edir |
|---|---|
| `Boşluq` / `↑` / `W` | tullan (uzun bas = daha yüksək) |
| `↓` / `S` | əyil / havada sürətli en |
| `P` / `Esc` | fasilə |
| `M` | səs aç/bağla |
| Toxunuş | ekrana toxun = tullan, `▼` düyməsi = əyil |

## Xüsusiyyətlər
- Chrome Dino fizikası: sabit cazibə, sürət artımı, düyməni buraxanda qısa tullanma, kadr tezliyindən asılı olmayan hərəkət (60/120/144 Hz)
- Rəngkarlıq üslublu parallax mənzərə: dərin mavi səma, krem işıqlı qabarıq buludlar, yaşıl-sarı təpələr, təpədə ev və cığır, vəhşi çiçəklər
- Xal artdıqca gün → qürub → gecə → səhər dövrü
- Rekord brauzerdə saxlanılır, səslər WebAudio ilə (xarici fayl yoxdur)
- Telefon və planşetdə işləyir

## İşə salmaq
`index.html` faylını brauzerdə aç. Build və ya asılılıq yoxdur.
`?debug` əlavə etsən toqquşma qutuları görünür, `?auto` avtopilotla göstərir.
