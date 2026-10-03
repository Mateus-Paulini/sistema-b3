# Conquista Estelar

Um RPG 2D retrô de conquista galáctica: conquiste planetas, aprimore minas e defesas,
melhore sua nave e proteja seus mundos do **Império Nyx**. Tudo em pixel art,
renderizado em baixa resolução (480×270) com efeitos sonoros 8-bit gerados na hora.

Feito com HTML5 Canvas + JavaScript puro. Não precisa de build nem de dependências.

## Como jogar

Abra `index.html` no navegador. Ou sirva a pasta localmente:

```bash
cd jogo-conquista-estelar
python -m http.server 8000
# acesse http://localhost:8000
```

O progresso é salvo automaticamente no `localStorage` do navegador.

### Controles

| Ação | Teclado | Mouse / Toque |
| --- | --- | --- |
| Mover nave | WASD / Setas | segurar e arrastar |
| Atirar | Espaço / J | segurar (atira junto) |
| Bomba de pulso | B / K | botão **Bomba** |
| Pausar / recuar | Esc / P | botão **Pausa** |
| Hangar (no mapa) | H | botão **Hangar** |
| Som liga/desliga | M | botão **Som** |

## Mecânicas

- **Mapa galáctico**: 14 planetas gerados proceduralmente e ligados por rotas.
  Você só pode invadir planetas vizinhos aos seus (anel amarelo).
- **Conquista**: combate de nave em estilo shoot 'em up, dividido em ondas
  (drones, caças, tanques). A capital Nyx é guardada por uma nau-capitânia (chefe).
- **Planetas**: cada planeta seu gera créditos por segundo.
  - *Mina*: aumenta a renda.
  - *Defesa*: adiciona torretas que lutam ao seu lado e aumenta a chance de
    resistir a invasões sem a sua ajuda.
- **Proteção**: o Império ataca periodicamente os seus planetas de fronteira.
  Você pode **defender pessoalmente** (as torretas do planeta ajudam) ou
  **confiar nas defesas** (resultado por chance). Ele também se expande sobre planetas piratas.
- **Hangar (RPG)**:
  - 7 aprimoramentos: Blindagem, Escudo, Laser, Cadência, Motor, Canhões e Ímã.
  - 3 naves: Falcão (equilibrada), Vespa (veloz) e Titã (pesada, +1 canhão).
  - Reparos e bombas de pulso.
- **Piloto**: ganha XP abatendo inimigos e conquistando planetas. Cada nível
  dá mais dano e mais casco.
- **Vitória**: tome todos os planetas do Império Nyx.
  **Derrota**: perca todos os seus planetas.
