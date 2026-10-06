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
| Acelerar para a frente (pelo bico) | W / ↑ | joystick (a nave gira e acelera) |
| Freio / ré lenta | S / ↓ | — |
| Girar | A D / ← → (ou o bico segue o mouse) | joystick |
| Atirar | Espaço / segurar clique no vazio | botão **Laser** |
| Piloto automático | clique num asteroide (minera), planeta (vai e entra em órbita) ou pirata (ataca) | toque no objeto |
| Turbo | Shift | botão **Turbo** |
| Entrar/sair de órbita | E | toque no aviso |
| Painéis | N nave · I império · R pesquisa · P política · C contratos · M mapa · H manual | barra inferior |
| Zoom | roda do mouse / + − | botões + − |

## O que tem no jogo

- **Universo infinito**: setores gerados por semente + coordenada, sempre iguais ao
  revisitar. 7 classes de estrela, buracos negros com gravidade, cinturões de
  asteroides, 8 tipos de planeta com texturas esféricas procedurais (rotação,
  iluminação, nuvens, oceanos, luzes noturnas, atmosfera, anéis).
- **Nave sem teto**: 7 atributos (casco, escudo, motor, armas, reator, carga,
  sensores) com níveis infinitos, custo = base × 1,15^nível. A cada 10 níveis
  somados a nave sobe de classe (Mk I, II, III…), muda de visual e ganha espaços de
  módulo.
- **Módulos**: 10 tipos (plasma, mísseis teleguiados, feixe de mineração, coletor,
  scanner, raio trator, blindagem, nanorreparo, propulsor, capacitor), 6 raridades
  (comum → artefato) e níveis infinitos. Obtidos em lojas, na forja (com minério),
  em estaleiros de colônias e nos destroços de piratas.
- **Combate**: piratas em frotas que escalam com a distância (batedores,
  corsários, canhoneiras, Sentinelas dos Antigos).
- **Planetas**: extração orbital de recursos, mercados com preços próprios,
  contratos (entrega, caça, exploração), colonização de mundos vazios e anexação
  de mundos habitados por influência.
- **Colônias**: 7 construções com níveis infinitos (mina, fazenda, habitat, porto
  comercial, universidade, estaleiro, defesa orbital). Geram créditos, pesquisa,
  recursos e módulos. A defesa orbital põe plataformas que atiram em piratas.
- **Pesquisa**: 7 tecnologias com níveis infinitos.
- **Governos e política**: 7 regimes (democracia, monarquia, tecnocracia,
  teocracia, corporatocracia, anarquia, regime militar) com efeitos reais em
  renda, pesquisa, defesa, crescimento e estabilidade. Troca de regime com custo.
  Vizinhos reagem por afinidade (alianças e embargos), mundos independentes mudam
  de regime sozinhos, e eventos com decisões: eleições, golpes, revoltas,
  sucessões, cismas, cartéis, epidemias, refugiados e raides. Estabilidade baixa
  pode levar à independência da colônia.
- **Ascensão**: ao chegar a 12 setores da origem ou ter 6 colônias, recomece numa
  nova galáxia com Essência estelar (+5% permanente em tudo por ponto).
- **Marcos narrativos** a cada anel de distância.

## Estrutura

- `js/core.js`: RNG determinístico, ruído simplex 3D, FBM, fila de geração em segundo plano.
- `js/universe.js`: tipos de planeta, recursos, estrelas e geração por setor.
- `js/data.js`: curvas de progressão, módulos, inimigos, construções, pesquisa, governos.
- `js/gfx.js`: renderização de planetas, estrelas, buracos negros, asteroides, naves e nebulosas.
- `js/ship.js`: atributos, armas, módulos, piratas e projéteis.
- `js/empire.js`: colônias, produção, política, eventos, contratos e ascensão.
- `js/ui.js`: painéis da interface e mapa galáctico.
- `js/main.js`: loop, pilotagem, piloto automático, render e HUD.
