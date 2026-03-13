<div align="center">
  <h1>Strada.MCP</h1>
  <p><strong>En kapsamli framework-destekli Unity MCP sunucusu</strong></p>
  <p>76 arac, 10 kaynak, 6 prompt — Strada.Core zekasi, RAG destekli arama ve Unity Editor koprusu ile</p>

  <p>
    <a href="https://github.com/okandemirel/Strada.MCP/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT"></a>
    <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg" alt="Node.js >= 20"></a>
    <a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/TypeScript-5.x-blue.svg" alt="TypeScript 5.x"></a>
    <a href="https://modelcontextprotocol.io"><img src="https://img.shields.io/badge/MCP-compatible-purple.svg" alt="MCP Compatible"></a>
    <img src="https://img.shields.io/badge/Unity-2021.3%2B-black.svg" alt="Unity 2021.3+">
  </p>

  <p>
    <a href="../README.md">English</a> |
    <a href="README.tr.md">Turkce</a> |
    <a href="README.ja.md">日本語</a> |
    <a href="README.ko.md">한국어</a> |
    <a href="README.zh.md">中文</a> |
    <a href="README.de.md">Deutsch</a> |
    <a href="README.es.md">Espanol</a> |
    <a href="README.fr.md">Francais</a>
  </p>
</div>

---

## Genel Bakis

Strada.MCP, Unity ve Strada.Core gelistirmesi icin ozel olarak tasarlanmis bir Model Context Protocol (MCP) sunucusudur. Yapay zeka asistanlarini (Claude, GPT vb.) dogrudan Unity is akisiniza baglar.

**Cift kullanici mimarisi:**
- **Bagimsiz mod** — Claude Desktop, Cursor, Windsurf, VS Code + Continue ile kutudan ciktiginda calisir
- **Brain modu** — Gelismis bellek, ogrenme ve hedef yurutme icin Strada.Brain ile entegre olur

**Neden Strada.MCP?**
- **Framework-destekli**: Strada.Core kaliplarini (ECS, MVCS, DI, moduller) anlayan tek Unity MCP sunucusu
- **Eksiksiz arac seti**: Dosya, git, .NET, kod analizi, Strada iskele yapisi, Unity calisma zamani, sahne/prefab, varliklar, alt sistemler ve proje yapilandirmasini kapsayan 76 arac
- **RAG destekli arama**: Tree-sitter C# ayristirma + Gemini embeddings + HNSW vektor arama
- **Gercek zamanli kopru**: Canli sahne manipulasyonu, bilesen duzenleme ve oynatma modu kontrolu icin Unity Editor'e TCP koprusu
- **Guvenlik oncelikli**: Dizin gecis onleme, kimlik bilgisi temizleme, salt okunur mod, betik calistirma onaylama

## Hizli Baslangic

### 1. Kurulum

```bash
npm install -g strada-mcp
```

Veya klonlayip derleyin:

```bash
git clone https://github.com/okandemirel/Strada.MCP.git
cd Strada.MCP
npm install
npm run build
```

### 2. IDE'nizi Yapilandirin

**Claude Desktop** — `~/Library/Application Support/Claude/claude_desktop_config.json` dosyasina ekleyin:

```json
{
  "mcpServers": {
    "strada-mcp": {
      "command": "strada-mcp",
      "env": {
        "UNITY_PROJECT_PATH": "/path/to/your/unity/project"
      }
    }
  }
}
```

**Cursor** — `.cursor/mcp.json` dosyasina ekleyin:

```json
{
  "mcpServers": {
    "strada-mcp": {
      "command": "strada-mcp",
      "env": {
        "UNITY_PROJECT_PATH": "/path/to/your/unity/project"
      }
    }
  }
}
```

### 3. Unity Paketini Yukleyin (istege bagli — tam arac erisimi icin)

Unity Package Manager > "+" > Git URL'sinden paket ekle:

```
https://github.com/okandemirel/Strada.MCP.git?path=unity-package/com.strada.mcp
```

### 4. Kullanmaya Baslayin

Yapay zeka asistaninizdan Unity projenizle calismasini isteyin:
- "Current ve Max alanlariyla bir ECS Health bileseni olustur"
- "Rigidbody bilesenine sahip tum GameObject'leri bul"
- "Proje mimarisini anti-kaliplar acisindan analiz et"
- "Kod tabaninda hasar hesaplama mantigi ara"

## Ozellikler

### Arac Kategorileri (toplam 76)

| Kategori | Sayi | Unity Bridge Gerektirir |
|----------|------|-------------------------|
| Strada Framework | 10 | Hayir |
| Unity Calisma Zamani | 18 | Evet |
| Unity Sahne/Prefab | 8 | Karma |
| Unity Varlik | 8 | Karma |
| Unity Alt Sistem | 6 | Evet |
| Unity Yapilandirma | 4 | Evet |
| Gelismis | 5 | Karma |
| Dosya Islemleri | 6 | Hayir |
| Arama | 3 | Hayir |
| Git | 6 | Hayir |
| .NET Derleme | 2 | Hayir |
| Analiz | 4 | Hayir |

- **Unity kapali**: 35+ arac kullanilabilir (dosya, git, arama, analiz, Strada iskele yapisi, .NET, sahne/prefab analizi)
- **Unity acik**: Kopru araciligiyla tum 76 arac aktif

### Strada Framework Araclari

Bu araclar Strada.MCP'ye ozgudur — hicbir rakip framework-destekli iskele yapisi sunmaz.

| Arac | Aciklama |
|------|----------|
| `strada_create_component` | StructLayout ile IComponent uygulayan bir ECS bilesen struct'i olusturur |
| `strada_create_system` | Bir Strada ECS sistemi olusturur (SystemBase, JobSystemBase veya BurstSystemBase) |
| `strada_create_module` | ModuleConfig, assembly tanimi ve klasor yapisina sahip bir Strada modulu olusturur |
| `strada_create_mediator` | ECS bilesenlerini bir Unity View'a baglayan bir EntityMediator olusturur |
| `strada_create_service` | Bir Strada servisi olusturur (Service, TickableService, FixedTickableService veya OrderedService) |
| `strada_create_controller` | Tipli model referansi ve view enjeksiyonu ile bir Strada Controller olusturur |
| `strada_create_model` | Tipli ozelliklerle bir Strada Model veya ReactiveModel olusturur |
| `strada_analyze_project` | Modulleri, sistemleri, bilesenleri, servisleri ve DI kullanimini haritalamak icin .cs dosyalarini tarar |
| `strada_validate_architecture` | Strada.Core adlandirma kurallari, yasam suresi kurallari ve bagimlilik kurallarini dogrular |
| `strada_scaffold_feature` | Eksiksiz bir ozellik iskelesi olusturur: modul + bilesenler + sistemler + istege bagli MVCS gorunumleri |

### Unity Calisma Zamani Araclari (18)

| Arac | Aciklama |
|------|----------|
| `unity_create_gameobject` | Yeni bir GameObject olusturur (bos, primitif veya prefab'dan) |
| `unity_find_gameobjects` | Ad, etiket, katman veya bilesen turune gore GameObject'leri bulur |
| `unity_modify_gameobject` | GameObject ozelliklerini degistirir (ad, aktif, etiket, katman, statik) |
| `unity_delete_gameobject` | Ornek kimligine gore sahneden bir GameObject siler |
| `unity_duplicate_gameobject` | Istege bagli yeni ad, ust nesne veya ofset ile bir GameObject'i cogaltir |
| `unity_add_component` | Tur adina gore bir GameObject'e bilesen ekler |
| `unity_remove_component` | Tur adina gore bir GameObject'ten bilesen kaldirir |
| `unity_get_components` | Bir GameObject'e bagli tum bilesenleri listeler |
| `unity_set_transform` | Bir GameObject donusumunun konum, donus ve/veya olcegini ayarlar |
| `unity_get_transform` | Bir GameObject'in mevcut donusumunu (konum, donus, olcek) alir |
| `unity_set_parent` | Bir GameObject'i yeni bir ust donusum altina yeniden baglar |
| `unity_play` | Unity oynatma modunu kontrol eder (oynat, duraklat, durdur veya bir kare ilerle) |
| `unity_get_play_state` | Mevcut Unity editor oynatma durumunu alir |
| `unity_execute_menu` | Yol ile bir Unity editor menu komutunu calistirir |
| `unity_console_log` | Unity konsoluna mesaj yazar (log, uyari veya hata) |
| `unity_console_clear` | Unity editor konsolunu temizler |
| `unity_selection_get` | Unity editor'de o anda secili nesneleri alir |
| `unity_selection_set` | Editor secimini belirtilen ornek kimliklerine ayarlar |

### Dosya ve Arama Araclari (9)

| Arac | Aciklama |
|------|----------|
| `file_read` | Satir numaralariyla dosya icerigini okur, istege bagli ofset/limit |
| `file_write` | Gerektiginde dizinleri olusturarak bir dosyaya icerik yazar |
| `file_edit` | Tam dize esleme kullanarak dosyadaki metni degistirir |
| `file_delete` | Bir dosyayi siler |
| `file_rename` | Bir dosyayi yeniden adlandirir veya tasir |
| `list_directory` | Dosya/dizin gostergesiyle dizin icerigini listeler |
| `glob_search` | Bir glob desenine uyan dosyalari arar |
| `grep_search` | Istege bagli baglam satirlariyla regex kullanarak dosya icerigini arar |
| `code_search` | RAG destekli anlamsal kod arama (indeksleme gerektirir) |

### Git Araclari (6)

| Arac | Aciklama |
|------|----------|
| `git_status` | Calisma agaci durumunu gosterir (porcelain formati) |
| `git_diff` | Calisma agaci ve indeks arasindaki degisiklikleri gosterir (staged/unstaged) |
| `git_log` | Commit gecmisini gosterir |
| `git_commit` | Dosyalari sahneye alir ve bir commit olusturur |
| `git_branch` | Dallari listeler, olusturur, siler veya degistirir |
| `git_stash` | Kaydedilmemis degisiklikleri saklar veya geri yukler |

### .NET Derleme Araclari (2)

| Arac | Aciklama |
|------|----------|
| `dotnet_build` | Bir .NET projesini derler ve hatalari/uyarilari ayristirir |
| `dotnet_test` | .NET testlerini calistirir ve sonuc ozetini ayristirir |

### Analiz Araclari (4)

| Arac | Aciklama |
|------|----------|
| `code_quality` | Strada.Core anti-kaliplari ve en iyi uygulama ihlalleri icin C# kodunu analiz eder |
| `csharp_parse` | C# kaynak kodunu siniflar, struct'lar, metotlar, alanlar ve ad alanlari ile yapilandirilmis bir AST'ye ayristirir |
| `dependency_graph` | Unity proje assembly referanslarini ve ad alani bagimliklarini analiz eder, dongusel bagimliliklari tespit eder |
| `project_health` | Kod kalitesi, bagimlilik analizi ve dosya istatistiklerini birlestiren kapsamli proje saglik kontrolu |

### Unity Sahne ve Prefab Araclari (8)

| Arac | Aciklama |
|------|----------|
| `unity_scene_create` | Yeni bir Unity sahnesi olusturur |
| `unity_scene_open` | Editor'de mevcut bir sahneyi acar |
| `unity_scene_save` | Mevcut sahneyi kaydeder |
| `unity_scene_info` | Sahne meta verilerini ve istatistiklerini alir |
| `unity_scene_analyze` | YAML'dan sahne hiyerarsisini analiz eder (kopru gerekmez) |
| `unity_prefab_create` | Bir GameObject'ten yeni bir prefab olusturur |
| `unity_prefab_instantiate` | Mevcut sahnede bir prefab ornekler |
| `unity_prefab_analyze` | YAML'dan prefab yapisini analiz eder (kopru gerekmez) |

### Unity Varlik Araclari (8)

| Arac | Aciklama |
|------|----------|
| `unity_asset_find` | Ad, tur veya etikete gore varlik arar |
| `unity_asset_dependencies` | Varlik bagimlilik zincirlerini analiz eder |
| `unity_asset_unused` | Projede potansiyel olarak kullanilmayan varliklari bulur |
| `unity_material_get` | Malzeme ozelliklerini ve shader atamalarini okur |
| `unity_material_set` | Malzeme ozelliklerini degistirir |
| `unity_shader_list` | Anahtar kelimeler ve ozelliklerle mevcut shader'lari listeler |
| `unity_scriptableobject_create` | Yeni bir ScriptableObject varligi olusturur |
| `unity_texture_info` | Doku iceri aktarma ayarlarini ve meta verileri alir |

### Unity Alt Sistem Araclari (6)

| Arac | Aciklama |
|------|----------|
| `unity_animation_play` | Animator oynatmayi kontrol eder |
| `unity_animation_list` | Animasyon kliplerini ve parametreleri listeler |
| `unity_physics_raycast` | Sahnede fizik isin izleme (raycast) yapar |
| `unity_navmesh_bake` | NavMesh ayarlarini pisir veya yapilandir |
| `unity_particles_control` | Parcacik sistemi oynatmayi kontrol eder |
| `unity_lighting_bake` | Aydinlatmayi pisir ve isik ayarlarini yapilandir |

### Unity Yapilandirma Araclari (4)

| Arac | Aciklama |
|------|----------|
| `unity_player_settings` | Oyuncu ayarlarini al/ayarla (sirket, urun, platform) |
| `unity_quality_settings` | Kalite seviyelerini ve grafik ayarlarini al/ayarla |
| `unity_build_settings` | Derleme hedeflerini, sahneleri ve secenekleri al/ayarla |
| `unity_project_settings` | Etiketleri, katmanlari, fizik ve girdi ayarlarini al/ayarla |

### Gelismis Araclar (5)

| Arac | Aciklama |
|------|----------|
| `batch_execute` | Tek bir istekte birden fazla arac calistirir |
| `script_execute` | Roslyn araciligiyla C# betikleri calistirir (onaylama gerekli, varsayilan olarak devre disi) |
| `script_validate` | Calistirmadan C# betik sozdizimini dogrular |
| `csharp_reflection` | Yansima yoluyla turleri, metotlari ve derlemeleri inceler |
| `unity_profiler` | Unity profiler verileri ve performans metriklerine erisir |

### RAG Destekli Kod Arama

```
C# Kaynak -> Tree-sitter AST -> Yapisal Parcalar -> Gemini Embeddings -> HNSW Vektor Indeksi
```

- Tum projede anlamsal kod arama
- Sinif/metot/alan sinirlarini anlar
- Artimsal indeksleme (yalnizca degisen dosyalar yeniden indekslenir)
- Hibrit yeniden siralama: vektor benzerligi + anahtar kelime + yapisal baglam

### Unity Editor Koprusu

Unity Editor'e gercek zamanli TCP baglantisi (port 7691):
- GameObject olusturma, bulma, degistirme, silme
- Bilesen ekleme/kaldirma/okuma
- Donusum manipulasyonu (konum, donus, olcek, yeniden baglama)
- Oynatma modu kontrolu (oynat, duraklat, durdur, ilerle)
- Konsol ciktisi (log, uyari, hata, temizle)
- Editor secim yonetimi
- Menu komutu calistirma

### Olay Akisi

Kopru, Unity Editor olaylarini gercek zamanli olarak yayinlar:
- `scene.changed` — Sahne acildi, kapandi, kaydedildi
- `console.line` — Yeni konsol log girisleri
- `compile.started` / `compile.finished` — Betik derleme
- `playmode.changed` — Oynat/duraklat/durdur gecisleri
- `selection.changed` — Secili nesne degisiklikleri

## Kaynaklar (10)

| URI | Aciklama | Kaynak |
|-----|----------|--------|
| `strada://api-reference` | Strada.Core API dokumantasyonu | Dosya tabanli |
| `strada://namespaces` | Strada.Core ad alani hiyerarsisi | Dosya tabanli |
| `strada://examples/{pattern}` | Kod ornekleri (ECS, MVCS, DI) | Dosya tabanli |
| `unity://manifest` | Unity paket manifesti (Packages/manifest.json) | Dosya tabanli |
| `unity://project-settings/{category}` | Kategoriye gore Unity proje ayarlari | Dosya tabanli |
| `unity://assemblies` | Unity assembly tanimlari (.asmdef dosyalari) | Dosya tabanli |
| `unity://file-stats` | Unity proje dosya istatistikleri | Dosya tabanli |
| `unity://scene-hierarchy` | Aktif sahne hiyerarsisi | Bridge |
| `unity://console-logs` | Son konsol ciktisi | Bridge |
| `unity://play-state` | Mevcut oynatma modu durumu | Bridge |

## Promptlar (6)

| Prompt | Aciklama |
|--------|----------|
| `create_ecs_feature` | ECS ozellik olusturma surecinde rehberlik eden cok mesajli sira (bilesen, sistem, modul kaydi) |
| `create_mvcs_feature` | Strada.Core icin MVCS kalip iskele yapisi rehberligi |
| `analyze_architecture` | Strada.Core projeleri icin mimari inceleme prompt'u |
| `debug_performance` | Unity projeleri icin performans hata ayiklama rehberligi |
| `optimize_build` | Unity projeleri icin derleme optimizasyonu kontrol listesi |
| `setup_scene` | Unity projeleri icin sahne kurulum is akisi rehberligi |

## Kurulum

### Onkosullar

- Node.js >= 20
- Unity 2021.3+ (kopru ozellikleri icin)
- Bir Strada.Core projesi (framework araclari icin — istege bagli)

### npm (onerilen)

```bash
npm install -g strada-mcp
```

### Kaynaktan

```bash
git clone https://github.com/okandemirel/Strada.MCP.git
cd Strada.MCP
npm install
npm run build
```

### IDE Yapilandirmasi

#### Claude Desktop

Dosya: `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) veya `%APPDATA%\Claude\claude_desktop_config.json` (Windows)

```json
{
  "mcpServers": {
    "strada-mcp": {
      "command": "strada-mcp",
      "env": {
        "UNITY_PROJECT_PATH": "/path/to/project",
        "EMBEDDING_API_KEY": "your-gemini-key"
      }
    }
  }
}
```

#### Cursor

Dosya: Calisma alaninin kokunde `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "strada-mcp": {
      "command": "npx",
      "args": ["strada-mcp"],
      "env": {
        "UNITY_PROJECT_PATH": "/path/to/project"
      }
    }
  }
}
```

#### Windsurf

Dosya: `~/.windsurf/mcp.json`:

```json
{
  "mcpServers": {
    "strada-mcp": {
      "command": "strada-mcp",
      "env": {
        "UNITY_PROJECT_PATH": "/path/to/project"
      }
    }
  }
}
```

#### Claude Code

Dosya: `~/.claude/settings.json` veya proje `.mcp.json`:

```json
{
  "mcpServers": {
    "strada-mcp": {
      "command": "strada-mcp",
      "env": {
        "UNITY_PROJECT_PATH": "/path/to/project"
      }
    }
  }
}
```

#### VS Code + Continue

Dosya: `.continue/config.json`:

```json
{
  "experimental": {
    "modelContextProtocolServers": [
      {
        "transport": {
          "type": "stdio",
          "command": "strada-mcp",
          "env": {
            "UNITY_PROJECT_PATH": "/path/to/project"
          }
        }
      }
    ]
  }
}
```

## Unity Paketi Kurulumu

### com.strada.mcp Kurulumu

1. Unity > Window > Package Manager'i acin
2. "+" > "Add package from git URL..." secin
3. Girin: `https://github.com/okandemirel/Strada.MCP.git?path=unity-package/com.strada.mcp`
4. Add'e tiklayin

### Yapilandirma

Kurulumdan sonra:
1. **Strada > MCP > Settings** bolumine gidin
2. Portu ayarlayin (varsayilan: 7691)
3. Otomatik baslatmayi etkinlestirin/devre disi birakin
4. MCP sunucusu baglandiginda baglanti durumu gostergesinin yesile dondugundan emin olun

### Manuel Kontrol

- **Strada > MCP > Start Server** — Kopruyu baslat
- **Strada > MCP > Stop Server** — Kopruyu durdur
- **Strada > MCP > Status** — Mevcut durumu logla

## Yapilandirma

Tum secenekler ortam degiskenleri araciligiyla yapilandirilir:

| Degisken | Aciklama | Varsayilan |
|----------|----------|------------|
| `MCP_TRANSPORT` | Aktarim modu: `stdio` veya `http` | `stdio` |
| `MCP_HTTP_PORT` | Akisli HTTP portu | `3100` |
| `MCP_HTTP_HOST` | HTTP baglama adresi | `127.0.0.1` |
| `UNITY_BRIDGE_PORT` | Unity Editor koprusu icin TCP portu | `7691` |
| `UNITY_BRIDGE_AUTO_CONNECT` | Baslatmada Unity'ye otomatik baglanma | `true` |
| `UNITY_BRIDGE_TIMEOUT` | Kopru baglanti zaman asimi (ms) | `5000` |
| `UNITY_PROJECT_PATH` | Unity proje yolu (bos ise otomatik algilama) | — |
| `EMBEDDING_PROVIDER` | Embedding saglayici: `gemini`, `openai`, `ollama` | `gemini` |
| `EMBEDDING_MODEL` | Embedding model adi | `gemini-embedding-2-preview` |
| `EMBEDDING_DIMENSIONS` | Embedding boyutlari (128-3072) | `768` |
| `EMBEDDING_API_KEY` | Embedding saglayici icin API anahtari | — |
| `RAG_AUTO_INDEX` | Baslatmada otomatik indeksleme | `true` |
| `RAG_WATCH_FILES` | Dosya degisikliklerini izle | `false` |
| `BRAIN_URL` | Strada.Brain HTTP URL'si (bos = devre disi) | — |
| `BRAIN_API_KEY` | Brain API anahtari | — |
| `ALLOWED_PATHS` | Virgul ile ayrilmis izin verilen kok dizin listesi | — |
| `READ_ONLY` | Genel salt okunur mod | `false` |
| `SCRIPT_EXECUTE_ENABLED` | Roslyn betik calistirmayi etkinlestir | `false` |
| `REFLECTION_INVOKE_ENABLED` | C# yansima metot cagirmayi etkinlestir | `false` |
| `MAX_FILE_SIZE` | Maksimum dosya boyutu (bayt) | `10485760` |
| `LOG_LEVEL` | Log seviyesi: `debug`, `info`, `warn`, `error` | `info` |
| `LOG_FILE` | Log dosya yolu (bos ise stderr) | — |

## Brain Entegrasyonu

Strada.Brain'e baglanildiginda (`BRAIN_URL` yapilandirildiginda):

- **Paylasimli bellek**: Brain'in uzun sureli bellegi arac onerilerini bilgilendirir
- **Birlestirilmis RAG**: Brain bellek baglami + MCP Tree-sitter AST birlesti
- **Ogrenme**: Arac kullanim kaliplari Brain'in ogrenme hattina geri beslenir
- **Hedef yurutme**: Brain, hedef planlari kapsaminda MCP araclarini cagirabilir

Brain olmadan, Strada.MCP tamamen bagimsiz bir MCP sunucusu olarak calisir.

## Guvenlik

| Katman | Koruma |
|--------|--------|
| Girdi Dogrulama | Tum araclarda Zod semasi + tur kontrolu |
| Yol Korumasi | Dizin gecis onleme, null bayt reddi, sembolik baglanti gecis onleme |
| Salt Okunur Mod | Genel + arac bazinda yazma izni zorlama |
| Kimlik Bilgisi Temizleme | Tum ciktilarda API anahtari/token kalip temizleme |
| Arac Beyaz Listesi | Unity koprusu yalnizca kayitli JSON-RPC komutlarini kabul eder |
| Hiz Sinirlamasi | Embedding API hiz siniri korumasi |
| Yalnizca Localhost | Unity koprusu yalnizca 127.0.0.1'e baglanir |
| Betik Calistirma | Roslyn calistirma varsayilan olarak devre disi, acik onaylama gerekli |

Tum ayrintilar icin [SECURITY.md](../SECURITY.md) dosyasina bakin.

## Gelistirme

### Kaynaktan Derleme

```bash
git clone https://github.com/okandemirel/Strada.MCP.git
cd Strada.MCP
npm install
npm run build
```

### Testleri Calistirma

```bash
npm test              # Tum testleri calistir
npm run test:watch    # Izleme modu
npm run typecheck     # TypeScript tur kontrolu
```

### Gelistirme Modu

```bash
npm run dev           # tsx ile calistir (otomatik yeniden yukleme)
```

### Proje Yapisi

```
src/
  config/          - Zod ile dogrulanmis yapilandirma
  security/        - Yol korumasi, temizleyici, dogrulayici
  tools/
    strada/        - 10 Strada framework araci
    unity/         - 18 kopruye bagimli Unity araci
    file/          - 6 dosya islem araci
    search/        - 3 arama araci (glob, grep, RAG)
    git/           - 6 git araci
    dotnet/        - 2 .NET derleme araci
    analysis/      - 4 kod analiz araci
  intelligence/
    parser/        - Tree-sitter C# ayristirici
    rag/           - Embedding, parcalayici, HNSW indeks
  bridge/          - Unity TCP kopru istemcisi
  context/         - Brain HTTP istemcisi
  resources/       - 10 MCP kaynak
  prompts/         - 6 MCP prompt
  utils/           - Logger, surec calistiricisi

unity-package/
  com.strada.mcp/  - C# Unity Editor paketi (UPM)
```

## Katki Saglama

Gelistirme kurulumu, kod standartlari ve PR rehberligi icin [CONTRIBUTING.md](../CONTRIBUTING.md) dosyasina bakin.

## Lisans

MIT Lisansi. Ayrintilar icin [LICENSE](../LICENSE) dosyasina bakin.
