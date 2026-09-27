# Florăria Bloom Petroșani

Site de prezentare pentru Florăria Bloom din Petroșani: buchete, cutii și coșuri cu flori, cu comandă rapidă pe WhatsApp.

## 🔗 Site live

**https://rocketknife1.github.io/floraria-bloom/**

## Ce conține

- **Hartă 3D reală a Văii Jiului** (străzi, blocuri și munți): alegi localitatea, iar mașina florăriei pleacă din fața magazinului și merge pe traseul real până acolo, cu prețul transportului afișat la sosire
- Drum animat la scroll, cu localitățile din Valea Jiului și prețurile de livrare
- „Povești” în stil Instagram, cu pauză (buton sau o atingere pe ecran) și glisare stânga/dreapta
- Galerie de lucrări reale, pe rânduri orizontale (buchete, cutii, coșuri)
- Accesorii din florărie: ghivece, foi pentru buchete, panglici, suporturi pentru plante, suporți, ornamente
- Camera plantelor: temperaturi și umiditate pe tipuri de plante, cu termometru interactiv
- Program cu stare live („Deschis acum” / „Închis”), hartă Google cu adresa
- Formular de comandă pe WhatsApp, cu „Ridic din florărie” sau „Livrare acasă” (localitate, adresă, interval)
- Responsive, cu bară de contact rapid pe mobil; respectă setarea „reduce motion”
- Politică de confidențialitate, linkuri ANPC / SAL, date structurate schema.org (`Florist`)

## Program, zone și prețuri de livrare

Toate se schimbă dintr-un singur loc: obiectul `CONFIG` de la începutul lui `js/main.js`.
Valorile de acum sunt **orientative** și apar pe site cu mențiunea „de confirmat” cât timp `draft: true`.

Numărul de telefon este momentan ascuns parțial.

## Harta 3D

- Bibliotecă: [MapLibre GL JS](https://maplibre.org/) (încărcată doar când vizitatorul ajunge la hartă)
- Hartă: [OpenFreeMap](https://openfreemap.org/), date © OpenStreetMap contributors, fără cheie API
- Relief: [AWS Terrain Tiles](https://registry.opendata.aws/terrain-tiles/), fără cheie API
- Traseele reale sunt precalculate în `js/routes.js` (OSRM), deci site-ul nu depinde de un serviciu de rutare. Dacă florăria se mută, traseele trebuie regenerate.

## Tehnologii

HTML, CSS și JavaScript simplu, fără framework și fără build. Fonturi: Marcellus și Jost (Google Fonts).

## Rulare locală

```bash
python -m http.server 8000
```

Apoi deschide http://localhost:8000.
