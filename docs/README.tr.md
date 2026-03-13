<div align="center">
  <h1>Strada.MCP</h1>
  <p><strong>Framework-bilinçli en kapsamlı Unity MCP sunucusu</strong></p>
  <p>49 araç, 10 kaynak, 6 istem — Strada.Core zekası, RAG destekli arama ve Unity Editor köprüsü ile</p>

  <p>
    <a href="https://github.com/okandemirel/Strada.MCP/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="Lisans: MIT"></a>
    <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg" alt="Node.js >= 20"></a>
    <a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/TypeScript-5.x-blue.svg" alt="TypeScript 5.x"></a>
    <a href="https://modelcontextprotocol.io"><img src="https://img.shields.io/badge/MCP-uyumlu-purple.svg" alt="MCP Uyumlu"></a>
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

Strada.MCP, Unity ve Strada.Core gelistirme icin ozel olarak tasarlanmis bir Model Context Protocol (MCP) sunucusudur. Yapay zeka asistanlarini (Claude, GPT vb.) dogrudan Unity is akisiniza baglar.

**Cift kullanim mimarisi:**
- **Bagimsiz mod** — Claude Desktop, Cursor, Windsurf, VS Code + Continue ile kutudan ciktiginda calisir
- **Brain modu** — Gelistirilmis bellek, ogrenme ve hedef yurutme icin Strada.Brain ile entegre olur

**Neden Strada.MCP?**
- **Framework-bilinçli**: Strada.Core kaliplarini (ECS, MVCS, DI, moduller) anlayan tek Unity MCP sunucusu
- **Kapsamli arac seti**: Dosya, git, .NET, kod analizi, Strada iskelesi ve Unity calisma zamani islemlerini kapsayan 49 arac
- **RAG destekli arama**: Tree-sitter C# ayristirma + Gemini gomulumleri + HNSW vektor arama
- **Canli kopru**: Sahne manipulasyonu, bilesen duzenleme ve oynatma modu kontrolu icin Unity Editor'e TCP koprüsü
- **Guvenlik oncelikli**: Yol gecisi onleme, kimlik bilgisi temizleme, salt okunur mod, betik calistirma onay sistemi

## Hizli Baslangic

### 1. Kurulum

```bash
npm install -g strada-mcp
```

Veya kaynaktan derleyin:

```bash
git clone https://github.com/okandemirel/Strada.MCP.git
cd Strada.MCP
npm install
npm run build
```

### 2. IDE Yapilandirmasi

**Claude Desktop** — `~/Library/Application Support/Claude/claude_desktop_config.json` dosyasina ekleyin:

```json
{
  "mcpServers": {
    "strada-mcp": {
      "command": "strada-mcp",
      "env": {
        "UNITY_PROJECT_PATH": "/proje/yolunuz"
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
        "UNITY_PROJECT_PATH": "/proje/yolunuz"
      }
    }
  }
}
```

### 3. Unity Paketi Kurulumu (istege bagli — tam arac erisimi icin)

Unity Package Manager > "+" > Git URL'den paket ekle:

```
https://github.com/okandemirel/Strada.MCP.git?path=unity-package/com.strada.mcp
```

### 4. Kullanmaya Baslayin

Yapay zeka asistaninizdan Unity projenizle calismasini isteyin:
- "Current ve Max alanlariyla bir ECS Health bileseni olustur"
- "Rigidbody bilesenine sahip tum GameObjectleri bul"
- "Proje mimarisini anti-patternler acisindan analiz et"
- "Kod tabaninda hasar hesaplama mantigi ara"

## Ozellikler

### Arac Kategorileri (toplam 49)

| Kategori | Sayi | Unity Koprüsü Gerekli |
|----------|------|-----------------------|
| Strada Framework | 10 | Hayir |
| Unity Calisma Zamani | 18 | Evet |
| Dosya Islemleri | 6 | Hayir |
| Arama | 3 | Hayir |
| Git | 6 | Hayir |
| .NET Derleme | 2 | Hayir |
| Analiz | 4 | Hayir |

- **Unity kapali**: 31 arac kullanilabilir (dosya, git, arama, analiz, Strada iskelesi, .NET)
- **Unity acik**: Kopru uzerinden tum 49 arac aktif

### Strada Framework Araclari

Bu araclar Strada.MCP'ye ozgudur — hicbir rakipte framework-bilinçli iskele yoktur.

| Arac | Aciklama |
|------|----------|
| `strada_create_component` | StructLayout ile IComponent uygulayan ECS bilesen yapisi olusturur |
| `strada_create_system` | Strada ECS sistemi olusturur (SystemBase, JobSystemBase veya BurstSystemBase) |
| `strada_create_module` | ModuleConfig, assembly tanimi ve klasor yapisiyla Strada modulu olusturur |
| `strada_create_mediator` | ECS bilesenlerini Unity View'a baglayan EntityMediator olusturur |
| `strada_create_service` | Strada servisi olusturur (Service, TickableService, FixedTickableService veya OrderedService) |
| `strada_create_controller` | Tipli model referansi ve view enjeksiyonu ile Strada Controller olusturur |
| `strada_create_model` | Tipli ozelliklerle Strada Model veya ReactiveModel olusturur |
| `strada_analyze_project` | .cs dosyalarini tarayarak modulleri, sistemleri, bilesenleri, servisleri ve DI kullanimini haritalar |
| `strada_validate_architecture` | Strada.Core adlandirma kurallarini, yasam suresi kurallarini ve bagimlilik kurallarini dogrular |
| `strada_scaffold_feature` | Komple ozellik iskelesi olusturur: modul + bilesenler + sistemler + istege bagli MVCS gorunumleri |

### Unity Calisma Zamani Araclari (18)

| Arac | Aciklama |
|------|----------|
| `unity_create_gameobject` | Yeni GameObject olusturur (bos, ilkel veya prefab'dan) |
| `unity_find_gameobjects` | Ad, etiket, katman veya bilesen turune gore GameObject bulur |
| `unity_modify_gameobject` | GameObject ozelliklerini degistirir (ad, aktif, etiket, katman, statik) |
| `unity_delete_gameobject` | Instance ID ile sahneden GameObject siler |
| `unity_duplicate_gameobject` | Istege bagli yeni ad, ebeveyn veya konum farki ile GameObject kopyalar |
| `unity_add_component` | Tur adina gore bir GameObjecte bilesen ekler |
| `unity_remove_component` | Tur adina gore bir GameObjectten bilesen kaldirir |
| `unity_get_components` | Bir GameObjecte bagli tum bilesenleri listeler |
| `unity_set_transform` | GameObject donusumunun konum, rotasyon ve/veya olcegini ayarlar |
| `unity_get_transform` | Bir GameObjectin guncel donusumunu alir (konum, rotasyon, olcek) |
| `unity_set_parent` | Bir GameObjecti yeni bir ebeveyn donusumu altina tasir |
| `unity_play` | Unity oynatma modunu kontrol eder (oynat, duraklat, durdur veya bir kare ilerle) |
| `unity_get_play_state` | Unity editorunun guncel oynatma durumunu alir |
| `unity_execute_menu` | Yol ile Unity editor menu komutunu calistirir |
| `unity_console_log` | Unity konsoluna mesaj yazar (log, uyari veya hata) |
| `unity_console_clear` | Unity editor konsolunu temizler |
| `unity_selection_get` | Unity editorunde secili nesneleri alir |
| `unity_selection_set` | Editor secimini belirtilen instance IDlere ayarlar |

### Dosya ve Arama Araclari (9)

| Arac | Aciklama |
|------|----------|
| `file_read` | Satir numaralariyla dosya icerigini okur, istege bagli konum/limit |
| `file_write` | Dosyaya icerik yazar, gerekirse dizinleri olusturur |
| `file_edit` | Tam dize esleme ile dosyada metin degistirir |
| `file_delete` | Dosya siler |
| `file_rename` | Dosya adini degistirir veya tasir |
| `list_directory` | Dosya/dizin gostergeleriyle dizin icerigini listeler |
| `glob_search` | Glob kalibina uyan dosyalari arar |
| `grep_search` | Regex ile dosya iceriklerini arar, istege bagli baglamsal satirlar |
| `code_search` | RAG destekli semantik kod arama (indeksleme gerektirir) |

### Git Araclari (6)

| Arac | Aciklama |
|------|----------|
| `git_status` | Calisma agaci durumunu gosterir (porcelain formati) |
| `git_diff` | Calisma agaci ile indeks arasindaki farklari gosterir |
| `git_log` | Commit gecmisini gosterir |
| `git_commit` | Dosyalari sahneye alir ve commit olusturur |
| `git_branch` | Dallari listeler, olusturur, siler veya degistirir |
| `git_stash` | Kaydedilmemis degisiklikleri saklar veya geri yukler |

### .NET Derleme Araclari (2)

| Arac | Aciklama |
|------|----------|
| `dotnet_build` | .NET projesini derler ve hatalari/uyarilari ayiristirir |
| `dotnet_test` | .NET testlerini calistirir ve sonuc ozetini ayiristirir |

### Analiz Araclari (4)

| Arac | Aciklama |
|------|----------|
| `code_quality` | Strada.Core anti-patternleri ve en iyi uygulama ihlalleri icin C# kodunu analiz eder |
| `csharp_parse` | C# kaynak kodunu siniflar, yapilar, yontemler, alanlar ve ad alanlariyla yapilandirmis AST'ye ayiristirir |
| `dependency_graph` | Unity proje assembly referanslarini ve ad alani bagimliliklarini analiz eder, dongusel bagimliliklari tespit eder |
| `project_health` | Kod kalitesi, bagimlilik analizi ve dosya istatistiklerini birlestiren kapsamli proje saglik kontrolu |

### RAG Destekli Kod Arama

```
C# Kaynak -> Tree-sitter AST -> Yapisal Parcalar -> Gemini Gomulumleri -> HNSW Vektor Indeksi
```

- Tum projenizde semantik kod arama
- Sinif/yontem/alan sinirlarini anlar
- Artimsal indeksleme (yalnizca degisen dosyalar yeniden indekslenir)
- Karma yeniden siralama: vektor benzerigi + anahtar kelime + yapisal baglam

### Unity Editor Koprüsü

Unity Editore gercek zamanli TCP baglantisi (port 7691):
- GameObject olusturma, bulma, degistirme, silme
- Bilesen ekleme/kaldirma/okuma
- Donusum manipulasyonu (konum, rotasyon, olcek, yeniden ebeveynleme)
- Oynatma modu kontrolu (oynat, duraklat, durdur, adimla)
- Konsol ciktisi (log, uyari, hata, temizle)
- Editor secim yonetimi
- Menu komutu calistirma

## Kaynaklar (10)

| URI | Aciklama | Kaynak |
|-----|----------|--------|
| `strada://api-reference` | Strada.Core API dokumantasyonu | Dosya tabanli |
| `strada://namespaces` | Strada.Core ad alani hiyerarsisi | Dosya tabanli |
| `strada://examples/{pattern}` | Kod ornekleri (ECS, MVCS, DI) | Dosya tabanli |
| `unity://manifest` | Unity paket manifesti | Dosya tabanli |
| `unity://project-settings/{category}` | Kategoriye gore Unity proje ayarlari | Dosya tabanli |
| `unity://assemblies` | Unity assembly tanimlari | Dosya tabanli |
| `unity://file-stats` | Unity proje dosya istatistikleri | Dosya tabanli |
| `unity://scene-hierarchy` | Aktif sahne hiyerarsisi | Kopru |
| `unity://console-logs` | Son konsol ciktisi | Kopru |
| `unity://play-state` | Guncel oynatma modu durumu | Kopru |

## Istemler (6)

| Istem | Aciklama |
|-------|----------|
| `create_ecs_feature` | ECS ozellik olusturma rehberi (bilesen, sistem, modul kaydi) |
| `create_mvcs_feature` | Strada.Core icin MVCS kalip iskele rehberi |
| `analyze_architecture` | Strada.Core projeleri icin mimari inceleme istemi |
| `debug_performance` | Unity projeleri icin performans hata ayiklama rehberi |
| `optimize_build` | Unity projeleri icin derleme optimizasyon kontrol listesi |
| `setup_scene` | Unity projeleri icin sahne kurulum is akisi rehberi |

## Yapilandirma

Tum secenekler cevre degiskenleri araciligiyla yapilandirilir:

| Degisken | Aciklama | Varsayilan |
|----------|----------|------------|
| `MCP_TRANSPORT` | Tasima modu: `stdio` veya `http` | `stdio` |
| `MCP_HTTP_PORT` | Streamable HTTP portu | `3100` |
| `MCP_HTTP_HOST` | HTTP baglama adresi | `127.0.0.1` |
| `UNITY_BRIDGE_PORT` | Unity Editor koprüsü icin TCP portu | `7691` |
| `UNITY_BRIDGE_AUTO_CONNECT` | Baslatmada Unity'ye otomatik baglan | `true` |
| `UNITY_BRIDGE_TIMEOUT` | Kopru baglanti zaman asimi (ms) | `5000` |
| `UNITY_PROJECT_PATH` | Unity proje yolu (bos ise otomatik tespit) | — |
| `EMBEDDING_PROVIDER` | Gomulum saglayici: `gemini`, `openai`, `ollama` | `gemini` |
| `EMBEDDING_MODEL` | Gomulum model adi | `gemini-embedding-2-preview` |
| `EMBEDDING_DIMENSIONS` | Gomulum boyutlari (128-3072) | `768` |
| `EMBEDDING_API_KEY` | Gomulum saglayici icin API anahtari | — |
| `RAG_AUTO_INDEX` | Baslatmada otomatik indeksle | `true` |
| `RAG_WATCH_FILES` | Dosya degisikliklerini izle | `false` |
| `BRAIN_URL` | Strada.Brain HTTP URL'si (bos = devre disi) | — |
| `BRAIN_API_KEY` | Brain API anahtari | — |
| `READ_ONLY` | Genel salt okunur mod | `false` |
| `SCRIPT_EXECUTE_ENABLED` | Roslyn betik calistirmayi etkinlestir | `false` |
| `MAX_FILE_SIZE` | Maksimum dosya boyutu (bayt) | `10485760` |
| `LOG_LEVEL` | Gunluk seviyesi: `debug`, `info`, `warn`, `error` | `info` |
| `LOG_FILE` | Gunluk dosyasi yolu (bos ise stderr) | — |

## Brain Entegrasyonu

Strada.Brain'e baglanildiginda (`BRAIN_URL` yapilandirildiginda):

- **Paylasimli bellek**: Brain'in uzun sureli bellegi arac onerilerini bilgilendirir
- **Birlestirilmis RAG**: Brain bellek baglami + MCP tree-sitter AST bir arada
- **Ogrenme**: Arac kullanim kaliplari Brain'in ogrenme boru hattina geri beslenir
- **Hedef yurutme**: Brain, hedef planlarinin parcasi olarak MCP araclarini cagirir

Brain olmadan, Strada.MCP tamamen bagimsiz bir MCP sunucusu olarak calisir.

## Guvenlik

| Katman | Koruma |
|--------|--------|
| Girdi Dogrulama | Tum araclarda Zod sema + tur kontrolu |
| Yol Korumasi | Dizin gecisi onleme, null bayt reddi, sembolik bag gecisi onleme |
| Salt Okunur Mod | Genel + arac bazinda yazma izni zorunlulugu |
| Kimlik Bilgisi Temizleme | Tum ciktida API anahtari/token kalip temizligi |
| Arac Beyaz Listesi | Unity koprüsü yalnizca kayitli JSON-RPC komutlarini kabul eder |
| Hiz Sinirlandirma | Gomulum API hiz siniri korunmasi |
| Yalnizca Localhost | Unity koprüsü yalnizca 127.0.0.1'e baglanir |
| Betik Calistirma | Roslyn calistirma varsayilan olarak devre disi, acik onay gerektirir |

Tam ayrintilar icin [SECURITY.md](../SECURITY.md) dosyasina bakin.

## Gelistirme

### Kaynaktan derleme

```bash
git clone https://github.com/okandemirel/Strada.MCP.git
cd Strada.MCP
npm install
npm run build
```

### Testleri calistirma

```bash
npm test              # Tum testleri calistir
npm run test:watch    # Izleme modu
npm run typecheck     # TypeScript tur kontrolu
```

### Gelistirme modu

```bash
npm run dev           # tsx ile calistir (otomatik yeniden yukleme)
```

## Katki

Gelistirme kurulumu, kod standartlari ve PR yonergeleri icin [CONTRIBUTING.md](../CONTRIBUTING.md) dosyasina bakin.

## Lisans

MIT Lisansi. Ayrintilar icin [LICENSE](../LICENSE) dosyasina bakin.
