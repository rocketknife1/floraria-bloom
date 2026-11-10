# Florăria Bloom Petroșani

Site de prezentare pentru Florăria Bloom din Petroșani: buchete, cutii și coșuri cu flori, cu comandă rapidă pe WhatsApp.

## 🔗 Site live

**https://rocketknife1.github.io/floraria-bloom/**

## ✏️ Cum schimbi site-ul (fără cod)

Deschide site-ul cu **`?edit`** la final:

**https://rocketknife1.github.io/floraria-bloom/?edit**

Îți vezi site-ul real. Lângă tot ce se poate schimba apare un contur și o **lupă**: texte, poze, produse, povești, accesorii, camera plantelor, program, telefon, adresă, livrare și comenzi.

- Atingi lupa, schimbi, iar pagina arată **pe loc** cum iese. „Gata” închide fereastra.
- **Produs nou:** la capătul fiecărui rând e un card **„+ Adaugă”**. Poza o alegi direct din telefon (se micșorează singură).
- **Nu mai ai ceva:** lupa → **„Ascunde”**. Rămâne pentru tine, estompat, și îl arăți iar oricând. „Șterge” îl scoate de tot.
- La final apeși **„Salvează”** (jos). Vizitatorii văd schimbarea în aproximativ un minut.
- **Meniul ☰:** Istoric (readuci orice versiune salvată), Mentenanță (închizi site-ul temporar, cu un mesaj), ajutor.

Prima dată pe un telefon sau calculator, editorul cere o **cheie de acces GitHub**. Pașii sunt chiar în fereastra de intrare și în [`admin/README.md`](admin/README.md).

Vrei doar să încerci, fără să salvezi nimic? **https://rocketknife1.github.io/floraria-bloom/?edit&demo**

## Comenzi

- **Clientul** alege pe site, doar cu atingeri: ce vrea, pentru când, ridicare sau livrare (localitatea și intervalul), bugetul. Apoi apasă **„Trimite detaliile florăriei”** și se deschide WhatsApp cu mesajul gata scris. Nu scrie nume sau telefon (WhatsApp le trimite singur), iar site-ul nu salvează nimic.
- **Florăria** pune comanda pe site, în modul editare, la „Ce pregătim acum”: **„+ Comandă nouă”**, apoi lupa → **„În lucru”** → Salvează. Vizitatorii văd doar ce se pregătește, pentru când și localitatea (fără nume, telefon sau adresă). La 30 de minute după intervalul ei, comanda trece singură la „livrate azi”.
- Numărul de **WhatsApp** la care ajung comenzile se pune din editor: lupa de lângă telefon.

## Ce conține

- **Hartă 3D reală a Văii Jiului** (străzi, blocuri și munți): alegi localitatea, iar mașina florăriei pleacă din fața magazinului și merge pe traseul real până acolo, cu prețul transportului afișat la sosire.
- Drum animat la scroll, cu localitățile din Valea Jiului și prețurile de livrare.
- „Povești” în stil Instagram, cu pauză (buton sau o atingere pe ecran) și glisare stânga/dreapta.
- Galerie de lucrări reale, pe rânduri orizontale (buchete, cutii, coșuri).
- Accesorii din florărie: ghivece, foi pentru buchete, panglici, suporturi pentru plante, suporți, ornamente.
- Camera plantelor: temperaturi și umiditate pe tipuri de plante, cu termometru interactiv.
- Program cu stare live („Deschis acum” / „Închis”), hartă Google cu adresa.
- Comandă pe WhatsApp, doar cu atingeri, și „Ce pregătim acum”.
- Fundal ilustrat discret: câte un desen floral cu linie subțire pe secțiunile deschise (`img/decor/`).
- Responsive, cu bară de contact rapid pe mobil; respectă setarea „reduce motion”.
- Politică de confidențialitate, linkuri ANPC / SAL, date structurate schema.org (`Florist`).

## Unde stă conținutul

Tot ce se schimbă din editor stă în **`content.json`**:
- `config`: program, telefon, WhatsApp, adresă, Facebook, Instagram, livrare;
- listele de pe pagină: galerie, povești, accesorii, camera plantelor, comenzi;
- `texts`: titlurile și paragrafele secțiunilor.

Ce se poate schimba și cum se cheamă câmpurile e descris în `admin/schema.json`. Ce e marcat „ascuns” rămâne în fișier, dar nu apare pe site. Valorile de program și livrare sunt **orientative** și apar cu „de confirmat” cât timp `draft` e bifat. Fără telefon completat, pe site apare „0723 ••• •••”.

## Harta 3D

- Bibliotecă: [MapLibre GL JS](https://maplibre.org/), încărcată doar când vizitatorul ajunge la hartă.
- Hartă: [OpenFreeMap](https://openfreemap.org/), date © OpenStreetMap contributors, fără cheie API.
- Relief: [AWS Terrain Tiles](https://registry.opendata.aws/terrain-tiles/), fără cheie API.
- Traseele reale sunt precalculate în `js/routes.js` (OSRM), deci site-ul nu depinde de un serviciu de rutare. Dacă florăria se mută, traseele trebuie regenerate.

## Tehnologii și găzduire

HTML, CSS și JavaScript simplu, fără framework, fără build și fără server. Fonturi: Marcellus și Jost (Google Fonts). Site-ul e găzduit gratuit pe **GitHub Pages**, din ramura `main`: orice „Salvează” din editor e un commit, iar GitHub publică singur.

## Rulare locală

```bash
python -m http.server 8000
```

Apoi deschide http://localhost:8000 (sau http://localhost:8000/?edit&demo pentru editor).
