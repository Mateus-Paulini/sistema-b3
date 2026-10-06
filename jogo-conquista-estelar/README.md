# Conquista Estelar

Jogo 2D de exploração espacial em visão de cima, com universo infinito gerado
proceduralmente. Baseado no roteiro de design "Jogo 2D de Espaço": progressão
infinita de naves, planetas procedurais infinitos, governos e política.

HTML5 Canvas + JavaScript puro, sem build nem dependências.

## Como rodar

```bash
cd jogo-conquista-estelar
python -m http.server 8000
# abra http://localhost:8000
```

Abrir o `index.html` direto no navegador também funciona. O progresso é salvo
no `localStorage`.

## Controles

| Ação | Teclado / mouse | Toque |
| --- | --- | --- |
| Propulsão | W A S D / setas | joystick (metade esquerda da tela) |
| Mirar | mouse | direção do joystick |
| Laser de mineração | clique / Espaço | botão **Laser** |
| Pós-combustão | Shift | botão **Turbo** |
| Entrar/sair de órbita | E | toque no aviso |
| Zoom | roda do mouse / + − | botões + − |
| Manual | H | botão **Manual** |

## Roteiro de desenvolvimento

- [x] **Estágio 1: exploração infinita**
  - Setores de 9.000 unidades gerados por semente + coordenada (sempre iguais
    ao revisitar), carregados sob demanda.
  - Sistemas estelares de 7 classes (anã vermelha a gigante azul), buracos
    negros com disco de acreção e gravidade, cinturões e aglomerados de asteroides.
  - Planetas de 8 tipos (rochoso, desértico, oceânico, terrestre, vulcânico,
    gelado, gigante gasoso, exótico) e variantes. Texturas esféricas procedurais
    com rotação, iluminação pela estrela, nuvens, oceanos com reflexo, luzes de
    cidades e lava no lado noturno, atmosfera e anéis.
  - Atributos por planeta: diâmetro, gravidade, temperatura, atmosfera,
    recursos, população, governo, perigos e mercado próprio.
  - Mineração (asteroides se partem e soltam minério), porão de carga, venda
    nos planetas, reparo, créditos de cartografia por descobertas.
  - A dificuldade e a riqueza crescem com a distância da origem (anéis).
- [ ] **Estágio 2: nave infinita**: atributos com níveis sem teto
  (custo = base × 1,15^nível), classes Mk que mudam o visual, módulos com
  raridade, piratas e combate.
- [ ] **Estágio 3: planetas**: colonização e árvores de melhoria infinitas
  (minas, fazendas, estaleiros, universidades, defesas orbitais), renda passiva.
- [ ] **Estágio 4: política**: escolha e troca de governo, diplomacia entre
  vizinhos, eleições, golpes e rebeliões, prestígio/ascensão.

## Estrutura

- `js/core.js`: RNG determinístico, ruído simplex 3D, FBM, fila de geração em segundo plano.
- `js/universe.js`: tabelas (tipos de planeta, recursos, governos, estrelas) e geração por setor.
- `js/gfx.js`: renderização de planetas, estrelas, buracos negros, asteroides, naves e nebulosas.
- `js/main.js`: loop do jogo, física de voo, HUD, radar, painéis e save.
