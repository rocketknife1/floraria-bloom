# Editarea site-ului, direct pe pagină

Proprietarul își vede **site-ul real**. Lângă tot ce se poate schimba apare un contur punctat și o **lupă**. Atinge lupa, schimbă textul, poza, prețul sau programul, iar pagina arată **pe loc** cum iese. „Gata” închide fereastra și poate căuta mai departe. La final apasă **„Salvează”** (jos), iar vizitatorii văd noua variantă în aproximativ un minut.

- **Din aplicația Organizator:** Site-uri → Florăria Bloom → **Editează site-ul**. Se deschide direct, fără logare (folosește tokenul din Setări).
- **Din browser:** https://rocketknife1.github.io/floraria-bloom/?edit (prima dată cere cheia de acces, vezi mai jos).
- **Demo:** `…/?edit&demo` merge fără cheie și nu salvează nimic.
- Adresa veche `…/admin/` duce acum tot aici.

## Ce se poate face

- **Texte, poze, prețuri, program, zone de livrare:** lupa de lângă ele.
- **Produse noi:** la capătul fiecărui rând (buchete, cutii, coșuri, povești, accesorii, plante) e un card „+ Adaugă”. Apare unul nou chiar acolo și se deschide pe loc.
- **Nu mai ai ceva:** lupa → „Ascunde”. Tu îl vezi estompat, vizitatorii deloc, iar „Arată pe site” îl readuce. „Șterge” îl scoate de tot.
- **Ordinea:** lupa → „← Mută” / „Mută →”.
- **Comenzi:** la „Ce pregătim acum” proprietarul vede toate comenzile, cu starea lor. „+ Comandă nouă” adaugă una, lupa îi schimbă starea (Cerere nouă → În lucru → Gata). Vizitatorii văd doar ce e „În lucru”, fără nume, telefon sau adresă.
- **Meniul (☰):** ascunde lupele (vezi site-ul curat, ca un vizitator), Istoric (readuci orice versiune), Mentenanță, ajutor, ieșire.
- **Ce n-ai salvat nu se pierde la o reîncărcare:** stă în sesiunea browserului până apeși „Salvează” sau „Renunță”.
- **Mentenanța:** cât e pornită, vizitatorii văd doar mesajul. Cine editează vede site-ul normal, iar bara de jos amintește că e în mentenanță.

## Cum funcționează

- `admin/schema.json` descrie ce se poate schimba și cum se cheamă câmpurile (texte, liste, poze, program…).
- Pagina își marchează bucățile: `data-edit="gallery/3"` (al patrulea produs), `data-edit="config/hours"` (programul), textele cu `data-text`. Liste: `data-edit-add="gallery"`. Toate acestea le pune `js/main.js` doar când adresa are `?edit`, deci vizitatorii nu le primesc.
- `admin/edit.js` + `admin/edit.css` sunt editorul. Stă într-un Shadow DOM peste pagină, ca stilurile lui și ale site-ului să nu se amestece. Se încarcă doar cu `?edit`.
- „Salvează” face un commit în repo prin API-ul GitHub (conținutul și pozele noi, micșorate automat, într-un singur commit). GitHub Pages publică singur în aproximativ un minut, iar bara de jos arată „Se publică…”, apoi „Pe site”.
- Nu există server. Editorul vorbește direct cu GitHub, cu o cheie de acces pusă o singură dată pe dispozitiv; cheia rămâne doar în browser. Aplicația Organizator o trimite în `#t=…` (partea de după `#` nu pleacă pe internet), iar editorul o scoate imediat din adresă.
- Dacă site-ul s-a schimbat între timp din altă parte, editorul nu scrie peste: cere să reîncarci.

## Cheia de acces (o singură dată pe fiecare telefon sau calculator, doar în browser)

1. Pe GitHub, în contul în care e repo-ul: *Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token*. Fereastra de intrare din editor are butonul „Creează cheia”, care deschide direct pagina asta.
2. *Repository access*: **Only select repositories** → repo-ul site-ului.
3. *Permissions → Contents*: **Read and write**. Nimic altceva.
4. *Generate token*, apoi cheia (`github_pat_…`) se lipește în editor.

Dacă cel care administrează e doar colaborator la repo, cheile „fine-grained” nu merg pentru repo-ul altcuiva: atunci folosește o cheie clasică cu dreptul `public_repo` (link în editor, la „Altă situație”).

## Când vinzi site-ul

*Settings → Transfer ownership*, iar repo-ul trece în contul cumpărătorului. Editorul își dă seama singur de repo din adresa de pe GitHub Pages (`cont.github.io/repo/`), deci merge fără nicio schimbare. Cumpărătorul își face cheia lui după pașii de mai sus. Dacă site-ul primește un domeniu propriu, se actualizează `"repo"` din `schema.json` (sau se scrie repo-ul o dată în editor, la „Altă situație”).

## Pentru alt site

1. Copiezi `admin/edit.js`, `admin/edit.css`, `admin/index.html` (redirecționarea) și acest README.
2. Scrii `admin/schema.json` pentru site-ul acela. Tipurile de câmp sunt cele din `edit.js`, funcția `field`: text, longtext, number, money, bool, select, date, time, color, image, imageList, stringList, slug, hours, weekdays, list, group, readonly.
3. În pagină: cu `?edit`, înainte să desenezi conținutul, `CONTENT = await (await import("admin/edit.js")).start()`; după ce ai desenat, `rendered()`. Marchezi bucățile cu `data-edit` / `data-edit-live` / `data-edit-add`, ca în `js/main.js`.
4. Opțional, în schema: `"repo": "cont/repo"`, `"accent": "#culoare"`, `"maintenance": "cale/maintenance.json"`. Bara fixă a site-ului care ar acoperi bara editorului primește `data-edit-hide`.

Chei de schemă folosite de editor:

- la un `select`: `"display": "chips"` arată butoane mari în loc de listă derulantă;
- la un `date`: `"quickDays": true` adaugă „Azi / Mâine / Poimâine”, iar un element nou pornește de la azi;
- la un `text`: `"placeholder"`;
- la o listă: `"newItemFirst": true` (elementele noi apar primele), `"itemTitle"` (titlul ferestrei), `"newItem"` (cum arată unul nou), `"fixedLength": true` (nu se adaugă și nu se șterg);
- câmpul `{"key": "hidden", "type": "bool"}` într-o listă înseamnă butonul „Ascunde”;
- în rădăcina schemei: `"demo": {"content.json": {...}}` dă date de probă pentru `?edit&demo`; zilele scrise `"@+0"`, `"@+1"` devin azi, mâine.
