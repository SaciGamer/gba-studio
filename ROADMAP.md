# 🗺️ Roadmap - Próximas Fases da Refatoração

## Fase 1: ✅ COMPLETA - Estrutura Base

```
✅ BuildTypes.ts
   ├─ TranscodeOptions
   ├─ CompileOptions
   ├─ TranscodeResult
   ├─ CompileResult
   └─ 4 interfaces adicionais

✅ TemplateBuilder
   ├─ Inicializa template
   ├─ Configura Makefile
   └─ Organiza estrutura

✅ ResourceBuilder
   ├─ Processa .gbasres
   ├─ Gera headers
   └─ Cria registry

✅ AssetBuilder
   ├─ Copia ativos
   ├─ Categoriza
   └─ Preserva estrutura

✅ transcode-project.ts
   ├─ Nova interface
   ├─ Usa builders
   └─ Sem quebra compat

✅ compile-gba.ts
   ├─ Nova interface
   ├─ Usa builders
   └─ Suporta legado

Status: 🟢 COMPLETA
Data: 25 de Novembro de 2025
```

## Fase 2: 📋 PRONTA - Processadores de Mídia

### 2.1 GraphicsBuilder (Grit Integration)

```
📋 Planejado

Tasks:
  - [x] Integrado no transcode-project.ts
  - [ ] GritProcessorBuilder.ts
  - [ ] Integrar grit processor
  - [ ] Processar .png → .c
  - [ ] Gerar headers
  - [ ] Suporte a paletas
  - [ ] Suporte a tiles
  - [ ] Exemplos de uso
  - [ ] Documentação
```

### 2.2 AudioBuilder (Maxmod Integration)

```
📋 Planejado

Tasks:
  - [ ] AudioProcessorBuilder.ts
  - [ ] Integrar maxmod
  - [ ] Processar .mp3 → .c
  - [ ] Processar .wav → .c
  - [ ] Metadados de áudio
  - [ ] Suporte a múltiplos formatos
  - [ ] Exemplos de uso
  - [ ] Documentação
```

### 2.3 MapBuilder (Tiled Integration)

```
📋 Planejado

Tasks:
  - [ ] MapProcessorBuilder.ts
  - [ ] Integrar bntmx.py
  - [ ] Processar .tmx files
  - [ ] Gerar collision maps
  - [ ] Suporte a layers
  - [ ] Exemplos de uso
  - [ ] Documentação
```

## Fase 3: 🔍 VALIDAÇÃO - Quality Assurance

```
🔍 Planejado

Tasks:
  - [ ] ProjectValidator.ts
  - [ ] Validar estrutura
  - [ ] Validar recursos
  - [ ] Validar ativos
  - [ ] Relatórios de erro
  - [ ] Sugestões de fix
  - [ ] Exemplos
  - [ ] Documentação

Tempo estimado: 2-3 semanas
```

## Fase 4: ⚡ OTIMIZAÇÃO - Performance

```
⚡ Planejado

Tasks:
  - [ ] BuildCache.ts
  - [ ] Detecção de mudanças
  - [ ] Cache incremental
  - [ ] Invalidação smart
  - [ ] Estatísticas
  - [ ] Benchmarks
  - [ ] Testes

Tempo estimado: 3-4 semanas
```

## Fase 5: 🧪 TESTING - Testes Completos

```
🧪 Planejado

Unit Tests:
  - [ ] BuildTypes.test.ts
  - [ ] TemplateBuilder.test.ts
  - [ ] ResourceBuilder.test.ts
  - [ ] AssetBuilder.test.ts
  - [ ] transcodeProject.test.ts
  - [ ] compileGBA.test.ts

Integration Tests:
  - [ ] Full pipeline test
  - [ ] End-to-end test
  - [ ] Real project test

E2E Tests:
  - [ ] Demo project
  - [ ] Sample project
  - [ ] Complex project

Tempo estimado: 4-5 semanas
```

## Fase 6: 🚀 CI/CD - Automação

```
🚀 Planejado

GitHub Actions:
  - [ ] Lint workflow
  - [ ] Test workflow
  - [ ] Build workflow
  - [ ] Release workflow

Docker:
  - [ ] Build image
  - [ ] Dev container
  - [ ] CI container

Tempo estimado: 2-3 semanas
```

## Timeline Estimada

```
Nov 2025
├─ ✅ 25 - Fase 1 COMPLETA

Dez 2025
├─ 02-13 - Fase 2.1 GraphicsBuilder (2 semanas)
├─ 09-20 - Fase 2.2 AudioBuilder (2 semanas)
└─ 23-31 - Fase 2.3 MapBuilder (1 semana)

Jan 2026
├─ 01-15 - Fase 3 Validação (2 semanas)
├─ 16-31 - Fase 4 Otimização (3 semanas, overlap)
└─ 15-Feb - Fase 5 Testing (4 semanas, overlap)

Fev 2026
├─ 01-14 - Fase 6 CI/CD (2 semanas)
└─ 15 - Release v2.0
```

## Milestones

```
📍 v1.0 (25 Nov 2025)
   ✅ Estrutura base completa
   ✅ Builders principais
   ✅ Documentação completa

📍 v1.1 (15 Dez 2025)
   ⏳ GraphicsBuilder
   ⏳ AudioBuilder
   ⏳ Mais documentação

📍 v1.2 (31 Dez 2025)
   ⏳ MapBuilder
   ⏳ ProjectValidator
   ⏳ Mais testes

📍 v2.0 (15 Fev 2026)
   ⏳ Cache e otimização
   ⏳ Testes completos
   ⏳ CI/CD pipeline
```

## Dependências Entre Fases

```
Fase 1 ✅
   ↓
Fase 2 (2.1 → 2.2 → 2.3)
   ↓
Fase 3
   ↓
Fase 4 & Fase 5 (paralelo)
   ↓
Fase 6
   ↓
Release v2.0
```

## Recursos Necessários

### Fase 2 (Processadores)
- [ ] Grit documentation
- [ ] Maxmod documentation
- [ ] Bntmx documentation
- [ ] Sample assets

### Fase 3 (Validação)
- [ ] Error handling patterns
- [ ] Validator framework
- [ ] Test projects

### Fase 4 (Otimização)
- [ ] Cache patterns
- [ ] Benchmark tools
- [ ] Performance profiling

### Fase 5 (Testing)
- [ ] Jest setup
- [ ] Test utilities
- [ ] Mock files

### Fase 6 (CI/CD)
- [ ] GitHub Actions
- [ ] Docker setup
- [ ] Release automation

## Critérios de Sucesso

### Fase 1 ✅
- [x] Sem erros TypeScript
- [x] Todas as interfaces definidas
- [x] Todos os builders funcionando
- [x] Documentação completa
- [x] Exemplos fornecidos

### Fase 2
- [ ] GraphicsBuilder processando .png
- [ ] AudioBuilder processando áudio
- [ ] MapBuilder processando maps
- [ ] Testes unitários passando
- [ ] Documentação atualizada

### Fase 3
- [ ] Validação de estrutura
- [ ] Validação de recursos
- [ ] Validação de ativos
- [ ] Relatórios de erro claros
- [ ] Documentação

### Fase 4
- [ ] Cache funcionando
- [ ] Builds incrementais
- [ ] 50% redução no tempo
- [ ] Estatísticas precisas
- [ ] Documentação

### Fase 5
- [ ] 80%+ cobertura de código
- [ ] Todos os testes passando
- [ ] E2E pipeline funcionando
- [ ] Performance ok
- [ ] Documentação

### Fase 6
- [ ] Workflows automáticos
- [ ] Docker builds
- [ ] Releases automáticas
- [ ] Integração GitHub
- [ ] Documentação

## Links Úteis

- [Grit](https://www.coranac.com/projects/grit/)
- [Maxmod](http://maxmod.devkitpro.org/)
- [Butano-Tiled](https://github.com/GValiente/butano)
- [Jest](https://jestjs.io/)
- [GitHub Actions](https://github.com/features/actions)

## Notas

- Todas as fases mantêm compatibilidade com v1.0
- Sem breaking changes planejados
- Implementação incremental possível
- Cada fase pode ser feita independentemente
- Timeline flexível conforme necessidade

---

**Roadmap Criado:** 25 de Novembro de 2025
**Próxima Review:** 15 de Dezembro de 2025
**Status Atual:** Fase 1 ✅ Completa
