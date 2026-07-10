# LinkedIn-post: "Hvor langt kan du ta Claude Fable på én dag?"

Status per 2026-07-10: tekst ferdig, trailer ferdig rendret og ligger på
`~/Desktop/wings-of-freedom-trailer.mp4` (1080x1350, 50 sek, musikk: "Eclipse Legion", CC0,
ingen kreditering nødvendig).

## Posttekst (norsk, endelig utkast)

Hvor langt kan du egentlig ta Claude Fable på én dag? Jeg og @Lars Tønder lekte oss i går.

Resultatet er et spill i nettleseren, inspirert av Attack on Titan. Du svinger deg gjennom en middelalderby på gass og wire, litt som Spider-Man, og feller monstre. Jo raskere du flyr, jo hardere treffer du, og jo mer poeng får du.

Alt er laget av Claude Fable: fysikken, grafikken, lyden, til og med flerspillerdelen. Tech stacken er TypeScript, Three.js og Cloudflare Workers. Min jobb var å ha det gøy: prate om spillmekanikkene jeg ville ha, teste underveis og si ifra når noe føltes feil. Og vi rakk til og med realtime multiplayer samme dag! Del en kode med opptil tre venner, så havner dere i samme by mot de samme monstrene, og etter kampen kåres lagets MVP.

Dommen fra sjefstesteren Lars: «Helvete så addicting» og «Jeg er på ekte mind blown av hvor gøy det er å treffe riktig». Resten av tilbakemeldingene var stort sett «OOOOOUF» og andre ordlyder.

En siste ting, i anledning morgendagens kvartfinale: Vår kjære Erling Braut Haaland gjemmer seg i spillet, og det gjør Harry Kane også. Kudos til den første som poster et skjermbilde av dem i kommentarfeltet!

Spillet er gratis, og det er ingenting å installere: attack-on-titan.magnusrodseth.com. Hvor mange runder klarer du å overleve?

PS: Videoen i posten er også laget med AI. Claude fikk råopptakene mine, Gemini så gjennom dem og plukket ut øyeblikkene med tidsstempler, og ffmpeg og Remotion klipte og satte det hele sammen. Jeg skal være ærlig på at den ser litt ræva ut, men det var et morsomt eksperiment.

Husk: @-taggen av Lars Tønder må settes i LinkedIn-editoren (skriv `@` og velg profilen).

Lenke-taktikk: domenet står som ren tekst i posten, klikkbar lenke legges i første
kommentar, og URL-en brennes inn i sluttkortet i videoen (LinkedIn demper rekkevidde
på poster med eksterne lenker).

Timing: posten publiseres før kvartfinalen 2026-07-11, så Haaland/Kane-referansen
(Striker og Captain i spillet) treffer mens kampen er dagsaktuell.

## Video: beats og tekstplakater (norsk)

Format: 4:5 (1080x1350), ca. 50 til 55 sekunder. Gameplay i 16:9 letterboxet med
merkevare-bars (Cloister Black / Cinzel, spillets egen stil). LinkedIn autospiller
uten lyd, så hvert beat har innbrent tekst. Musikk: spillets egne spor
("Five Armies" av Kevin MacLeod, CC-BY med kreditering; "Eclipse Legion", CC0).

| Tid | Beat | Tekstplakat |
| --- | --- | --- |
| 0:00-0:03 | Cold open: beste kill (fart, blå speedo, one-cut i slow-mo) | "Hvor langt kan du egentlig ta Claude Fable på én dag?" |
| 0:03-0:09 | Reveal: utskyting fra muren / flytur over byen | "Dette ble resultatet" |
| 0:09-0:22 | Singleplayer-montasje | "Jo raskere du flyr, jo hardere treffer du, og jo mer poeng får du" / "Mellom bølgene velger du oppgraderinger" |
| 0:22-0:36 | Flerspiller | "Spill multiplayer med vennene dine" |
| 0:36-0:45 | Haaland/Kane-tease (glimt av Striker og Captain + 3x-jackpot-kill) | "Haaland og Kane gjemmer seg i spillet. Klarer du å finne dem?" |
| 0:45-0:52 | Sluttkort | "Hvor mange runder klarer du å overleve?" + attack-on-titan.magnusrodseth.com |

## Opptaksliste (det som skal spilles inn)

1080p60, 16:9, noen sekunder luft foran og bak hvert øyeblikk. Klippene trenger ikke
trimmes eller sorteres. F3-overlay av på skjønnhetsskudd. `?seed=` gir reproduserbar by.

1. Hero-kill: lang swing-kjede, speedo blir blå, one-cut nape-kill, gjerne med Q-fokus slow-mo (ta flere takes)
2. Etablering: utskyting fra muren eller flytur over byen, minst mulig HUD
3. Fartsregelen: ett tregt treff som spretter av, så ett raskt one-cut
4. Fokus (Q) slow-mo i lufta mellom titaner
5. Thunder spear-kill
6. Resupply-run: lite gass, stup ned til den grønne plass-ringen midt i en bølge
7. Oppgraderingsvalg mellom bølger
8. Flerspiller: lobbykode på skjerm, venn som joiner, 4 soldater mot én titan, team wipe med MVP-skjerm, leaderboard (2-bot-lobbyautomatikken kan brukes som venner)
9. Haaland/Striker og Kane/Captain: spawn med ansiktene synlige, jackpot-kill med 3x-popup
10. Rent menyskudd til sluttkortet

## Produksjonspipeline (når klippene er klare)

1. Gemini (GEMINI_API_KEY er sourcet fra dotfiles) ser gjennom klippene og gir
   tidsstempler og beskrivelser som strukturert JSON
2. Rammeekstraksjon med ffmpeg for visuell verifisering av kuttpunkter
3. ffmpeg: frame-accurate trims og normalisering (oppløsning, fps, pixel format)
4. Remotion: 4:5-canvas, tekstplakater, overganger, merkevare, musikk med fades
5. `npx remotion render` til MP4, siste loudnorm-pass i ffmpeg
