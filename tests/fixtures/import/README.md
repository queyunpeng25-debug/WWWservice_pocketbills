# Bill import fixtures

Sample bills for the import feature. Text-based files (`.eml`, `.txt`, the text-layer PDF) are checked automatically by `tests/import-fixtures.test.js`. Images need OCR in a browser: run `npm run dev`, open the demo workspace and drag each file onto the page.

| File                           | What it tests                                                                   | Expected form                                                                             |
| ------------------------------ | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `electricity-html-base64.eml`  | multipart email, base64 HTML-only body, `&euro;` entities, decimal comma        | Electric Ireland · €82.40 · 2026-12-03 · Monthly · Utilities · matches demo “Electricity” |
| `netflix-quoted-printable.eml` | quoted-printable body, RFC 2047 encoded subject, plain part preferred over HTML | Netflix · €13.99 · 2026-12-10 · Monthly · Entertainment · matches demo “Netflix”          |
| `insurance-annual.txt`         | written date, yearly wording                                                    | VHI Healthcare · €480.00 · 2027-02-01 · Yearly · Health & fitness                         |
| `rent-german.txt`              | German labels, `1.200,00 €`, `DD.MM.YYYY`                                       | Hausverwaltung Müller GmbH · €1,200.00 · 2026-12-01 · Monthly · Housing                   |
| `phone-gbp.txt`                | non-EUR currency                                                                | Vodafone UK · amount empty with “Found GBP 34.50” warning · 2026-12-18                    |
| `no-amount-letter.txt`         | nothing to pay                                                                  | amount and date flagged; nothing invented                                                 |
| `tuition-text-layer.pdf`       | PDF text layer                                                                  | Trinity Summer School · €1,250.00 · 2027-01-15 · One-time · Education                     |
| `scanned-image-only.pdf`       | PDF without text                                                                | error: “This PDF is a scan without text…”                                                 |
| `water-bill.png`               | clean OCR                                                                       | Uisce Eireann · €56.30 · 2026-12-20 · Monthly · Utilities                                 |
| `spotify-photo-noisy.png`      | rotated, blurred, off-white “photo”                                             | Spotify · €16.99 · 2026-12-28 · Monthly · Entertainment · matches demo “Spotify”          |
