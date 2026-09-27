# Florăria Bloom Petro•••••

Site de prezentare pentru Florăria Bloom din Petro•••••: buchete, cutii și coșuri cu flori, cu comandă rapidă pe WhatsApp.

## 🔗 Site live

**https://rocketknife1.github.io/floraria-bloom/**

## Ce conține

- „Povești” din florărie în stil Instagram: cercuri pe care le apeși și le răsfoiești pe tot ecranul
- Galerie de lucrări reale, pe rânduri orizontale (buchete, cutii, coșuri), cu vizualizare mărită
- **Livrare la domiciliu cu mașina florăriei**: o dubiță merge pe drum pe măsură ce derulezi și aprinde zonele de livrare, plus un contor real până la ora limită pentru livrarea în aceeași zi
- Program cu stare live („Deschis acum” / „Închis”) și ziua de azi evidențiată
- Formular de comandă care deschide WhatsApp cu mesajul gata scris, cu opțiunea „Ridic din florărie” sau „Livrare acasă” (zonă, adresă, interval orar)
- Animații: pozele „înfloresc” la intrare, iar conținutul se mărește când ajunge în centrul ecranului
- Responsive, cu bară de contact rapid pe mobil; respectă setarea „reduce motion”
- Politică de confidențialitate, linkuri ANPC / SAL, date structurate schema.org (`Florist`)

## Program, zone și prețuri de livrare

Toate se schimbă dintr-un singur loc: obiectul `CONFIG` de la începutul lui `js/main.js`.
Valorile de acum sunt **orientative** și apar pe site cu mențiunea „de confirmat” cât timp `draft: true`.
Când completezi `mapsQuery` cu adresa completă, apare automat harta Google.

Datele de contact (oraș, telefon) sunt momentan ascunse parțial.

## Tehnologii

HTML, CSS și JavaScript simplu, fără framework și fără build. Fonturi: Marcellus și Jost (Google Fonts).

## Rulare locală

```bash
python -m http.server 8000
```

Apoi deschide http://localhost:8000.
