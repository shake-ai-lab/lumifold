// ---- 1 ファイルにまとめた資料(.deck の中身が zip のもの) ----
// 作業中の資料はテキストの .deck(中身は deck.json と同じ)+ assets/ + widgets/ のフォルダ。
// 人に渡すときだけ zip 1 つにまとめ、開くときは隣のフォルダに展開して作業中の形に戻す。
use std::collections::HashSet;
use std::io::{Read, Seek, Write};
use std::path::{Component, Path, PathBuf};

use zip::write::SimpleFileOptions;
use zip::CompressionMethod;

use crate::{extension_lower, io_err, parent_dir, replace_via_temp, since_epoch};

/// zip の中で本文を置く名前。展開すると `<資料名>.deck` になる
const PACKAGE_MAIN: &str = "deck.json";
/// 展開の上限(壊れたファイルや悪意のあるファイルでディスクを埋めない)
const UNPACK_MAX_FILES: usize = 10_000;
const UNPACK_MAX_BYTES: u64 = 2 << 30;
const UNPACK_MAX_LABEL: &str = "2 GB";

/// 中身が zip かどうか(先頭が PK\x03\x04)。テキストの .deck / deck.json は false
fn is_package(path: &Path) -> Result<bool, String> {
    let mut head = [0u8; 4];
    let mut file = std::fs::File::open(path).map_err(|e| io_err(path, e))?;
    let n = file.read(&mut head).map_err(|e| io_err(path, e))?;
    Ok(n == head.len() && &head == b"PK\x03\x04")
}

#[derive(serde::Serialize)]
pub(crate) struct PreparedDeck {
    path: String,
    unpacked: bool,
}

/// 開く前の下ごしらえ。まとめたファイルなら隣のフォルダ(`資料名/`、あれば `資料名 (2)/` …)に展開し、
/// 展開した本文(`資料名/資料名.deck`)のパスを返す。同じファイルを展開済みならそのフォルダを返す。
/// テキストの資料はそのまま返す。
#[tauri::command]
pub(crate) fn prepare_deck(path: String) -> Result<PreparedDeck, String> {
    let src = Path::new(&path);
    if !is_package(src)? {
        return Ok(PreparedDeck { path, unpacked: false });
    }
    let main = unpack_package(src)?;
    Ok(PreparedDeck { path: main.to_string_lossy().into_owned(), unpacked: true })
}

/// 展開したフォルダ(と、隣にまとめた元のフォルダ)に残す「どのファイルと対応するか」の印。
/// 同じファイル(場所・大きさ・更新時刻が同じ)をもう一度開いたら、展開し直さずにそのフォルダ(編集済みの作業中のもの)を開く。
const SOURCE_MARKER: &str = ".deck-source.json";

#[derive(serde::Serialize, serde::Deserialize)]
struct SourceStamp {
    source: String,
    size: u64,
    modified: u64,
    /// フォルダ内の本文のファイル名(旧形式の deck.json もある)。無ければ `<資料名>.deck`
    #[serde(default, skip_serializing_if = "Option::is_none")]
    main: Option<String>,
}

impl SourceStamp {
    fn same_file(&self, other: &SourceStamp) -> bool {
        self.source == other.source && self.size == other.size && self.modified == other.modified
    }
}

fn source_stamp(zip_path: &Path) -> Result<SourceStamp, String> {
    let meta = std::fs::metadata(zip_path).map_err(|e| io_err(zip_path, e))?;
    let modified = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map_or(0, |d| d.as_millis() as u64);
    // 区切りや大文字小文字の違いで別物扱いしない
    let source = std::fs::canonicalize(zip_path)
        .unwrap_or_else(|_| zip_path.to_path_buf())
        .to_string_lossy()
        .to_lowercase();
    Ok(SourceStamp { source, size: meta.len(), modified, main: None })
}

fn read_marker(dir: &Path) -> Option<SourceStamp> {
    serde_json::from_str(&std::fs::read_to_string(dir.join(SOURCE_MARKER)).ok()?).ok()
}

fn write_marker(dir: &Path, stamp: &SourceStamp) -> Result<(), String> {
    let text = serde_json::to_string_pretty(stamp).map_err(|e| e.to_string())?;
    let path = dir.join(SOURCE_MARKER);
    std::fs::write(&path, text).map_err(|e| io_err(&path, e))
}

fn unpack_package(zip_path: &Path) -> Result<PathBuf, String> {
    let fail = |e: String| io_err(zip_path, e);
    let stem = zip_path
        .file_stem()
        .and_then(|s| s.to_str())
        .filter(|s| !s.is_empty())
        .unwrap_or("deck")
        .to_string();
    let main_name = format!("{}.deck", stem);
    let parent = parent_dir(zip_path)?;
    let stamp = source_stamp(zip_path)?;
    // 展開済みならそのフォルダを開く。無ければ空いている名前に展開する(既にあるフォルダは上書きしない)
    let mut dest = None;
    for i in 1..1000 {
        let dir = if i == 1 { parent.join(&stem) } else { parent.join(format!("{} ({})", stem, i)) };
        if !dir.exists() {
            dest = Some(dir);
            break;
        }
        if let Some(marker) = read_marker(&dir).filter(|m| m.same_file(&stamp)) {
            let main = dir.join(marker.main.as_deref().unwrap_or(&main_name));
            if main.is_file() {
                return Ok(main);
            }
        }
    }
    let dest = dest.ok_or_else(|| fail("展開先のフォルダ名を決められません".into()))?;
    let file = std::fs::File::open(zip_path).map_err(|e| fail(e.to_string()))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| fail(e.to_string()))?;
    if archive.len() > UNPACK_MAX_FILES {
        return Err(fail(format!("ファイル数が多すぎます({} 個)", archive.len())));
    }
    if archive.index_for_name(PACKAGE_MAIN).is_none() {
        return Err(fail(format!("資料の本文({})が入っていません", PACKAGE_MAIN)));
    }
    // 一時フォルダに展開してから名前を変える(途中で失敗しても半端なフォルダを残さない)
    let tmp = parent.join(format!(".{}.unpacking-{}", stem, since_epoch().as_nanos()));
    std::fs::create_dir(&tmp).map_err(|e| io_err(&tmp, e))?;
    let done = extract_into(&mut archive, &tmp, &main_name)
        .and_then(|_| write_marker(&tmp, &stamp))
        .and_then(|_| std::fs::rename(&tmp, &dest).map_err(|e| io_err(&dest, e)));
    if let Err(e) = done {
        let _ = std::fs::remove_dir_all(&tmp);
        return Err(fail(e));
    }
    Ok(dest.join(main_name))
}

fn extract_into<R: Read + Seek>(archive: &mut zip::ZipArchive<R>, dir: &Path, main_name: &str) -> Result<(), String> {
    let mut budget = UNPACK_MAX_BYTES;
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let name = entry.name().unwrap_or_default().to_string();
        // フォルダの外(../ など)を指す名前は受け付けない(zip の enclosed_name で判定)。
        // 「:」は Windows では別のデータの流れ(代替データストリーム)として書かれてしまうので、まとめる側と同じく拒否する
        let rel = entry
            .enclosed_name()
            .filter(|_| !name.contains(':'))
            .ok_or_else(|| format!("フォルダの外を指す名前が含まれています: {}", name))?;
        let rel = if rel == Path::new(PACKAGE_MAIN) { PathBuf::from(main_name) } else { rel };
        let out = dir.join(&rel);
        if entry.is_dir() {
            std::fs::create_dir_all(&out).map_err(|e| io_err(&out, e))?;
            continue;
        }
        if let Some(p) = out.parent() {
            std::fs::create_dir_all(p).map_err(|e| io_err(p, e))?;
        }
        let mut file = std::fs::File::create(&out).map_err(|e| io_err(&out, e))?;
        let written = std::io::copy(&mut (&mut entry).take(budget + 1), &mut file).map_err(|e| io_err(&rel, e))?;
        if written > budget {
            return Err(format!("展開後の大きさが上限({})を超えます", UNPACK_MAX_LABEL));
        }
        budget -= written;
    }
    Ok(())
}

#[derive(serde::Deserialize)]
pub(crate) struct PackEntry {
    /// zip の中の名前(`assets/fig.png` など、資料からの相対パス)
    name: String,
    /// 手元のファイルのパス
    src: String,
}

/// zip の中の名前として安全か(相対パスで、.. や空の区切りを含まない)
fn is_safe_entry_name(name: &str) -> bool {
    !name.is_empty()
        && !name.contains('\\')
        && !name.contains(':')
        && name.split('/').all(|part| !part.is_empty() && part != "." && part != "..")
        && Path::new(name).components().all(|c| matches!(c, Component::Normal(_)))
}

/// 資料を 1 ファイル(zip)にまとめる。本文 text は deck.json として、entries は name の場所に入れる。
/// 見つからないファイルは飛ばし、その name の一覧を返す(画面で知らせる)。書き込みは一時ファイル経由。
/// 作業中の資料(deck_path)のフォルダに印を付け、まとめたファイルを開いたときにそのフォルダを開くようにする。
/// 付けるのは、フォルダが out の隣の同名フォルダ(開くときに展開先として探す場所)のときと、out から展開したフォルダのとき。
#[tauri::command]
pub(crate) fn pack_deck(out: String, text: String, entries: Vec<PackEntry>, deck_path: Option<String>) -> Result<Vec<String>, String> {
    let target = PathBuf::from(&out);
    let missing = replace_via_temp(&target, |tmp| write_package(tmp, &text, &entries))?;
    if let Some(main) = deck_path.as_deref().map(Path::new) {
        link_working_folder(&target, main);
    }
    Ok(missing)
}

/// 印は付けられなくても、まとめること自体は成功にする(次に開くと別のフォルダに展開されるだけ)
fn link_working_folder(package: &Path, main: &Path) {
    let (Some(dir), Some(name), Ok(mut stamp)) =
        (main.parent(), main.file_name().and_then(|n| n.to_str()), source_stamp(package))
    else {
        return;
    };
    let sibling = package.with_extension("");
    let is_sibling = matches!(
        (std::fs::canonicalize(dir), std::fs::canonicalize(&sibling)),
        (Ok(a), Ok(b)) if a == b
    );
    if is_sibling || read_marker(dir).is_some_and(|m| m.source == stamp.source) {
        stamp.main = Some(name.to_string());
        let _ = write_marker(dir, &stamp);
    }
}

fn write_package(path: &Path, text: &str, entries: &[PackEntry]) -> Result<Vec<String>, String> {
    let file = std::fs::File::create(path).map_err(|e| io_err(path, e))?;
    let mut zip = zip::ZipWriter::new(file);
    let deflated = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
    // 圧縮済みの画像はそのまま入れる(縮まないのに時間だけかかる)
    let stored = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);
    zip.start_file(PACKAGE_MAIN, deflated).map_err(|e| e.to_string())?;
    zip.write_all(text.as_bytes()).map_err(|e| e.to_string())?;
    let mut seen: HashSet<String> = HashSet::from([PACKAGE_MAIN.to_string()]);
    let mut missing = Vec::new();
    for entry in entries {
        if !is_safe_entry_name(&entry.name) {
            return Err(format!("まとめられない名前です: {}", entry.name));
        }
        if !seen.insert(entry.name.to_lowercase()) {
            continue;
        }
        // 無いファイルだけ飛ばして知らせる。読めない(使用中・権限がない)ときは、欠けたまま成功にしない
        let src = Path::new(&entry.src);
        let mut source = match std::fs::File::open(src) {
            Ok(f) => f,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                missing.push(entry.name.clone());
                continue;
            }
            Err(e) => return Err(io_err(src, e)),
        };
        let compressed = matches!(extension_lower(Path::new(&entry.name)).as_str(), "png" | "jpg" | "jpeg" | "gif" | "webp");
        zip.start_file(entry.name.as_str(), if compressed { stored } else { deflated }).map_err(|e| e.to_string())?;
        std::io::copy(&mut source, &mut zip).map_err(|e| io_err(src, e))?;
    }
    zip.finish().map_err(|e| e.to_string())?;
    Ok(missing)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::with_suffix;

    fn temp_dir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("lumifold-test-{}-{}", tag, since_epoch().as_nanos()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn entry(name: &str, src: &Path) -> PackEntry {
        PackEntry { name: name.into(), src: src.to_string_lossy().into_owned() }
    }

    #[test]
    fn pack_then_open_restores_working_folder() {
        let dir = temp_dir("roundtrip");
        let work = dir.join("work");
        std::fs::create_dir_all(work.join("assets")).unwrap();
        std::fs::create_dir_all(work.join("widgets")).unwrap();
        std::fs::write(work.join("assets/fig.png"), [0x89, b'P', b'N', b'G', 1, 2, 3]).unwrap();
        std::fs::write(work.join("widgets/w.html"), "<p>動く</p>").unwrap();
        let text = "{\"version\":1,\"title\":\"日本語\"}\n";
        let out = dir.join("資料.deck");

        let missing = pack_deck(
            out.to_string_lossy().into_owned(),
            text.into(),
            vec![
                entry("assets/fig.png", &work.join("assets/fig.png")),
                entry("widgets/w.html", &work.join("widgets/w.html")),
                entry("assets/none.png", &work.join("assets/none.png")),
            ],
            None,
        )
        .unwrap();
        assert_eq!(missing, vec!["assets/none.png".to_string()]);
        assert!(!with_suffix(&out, ".tmp").exists());

        let opened = prepare_deck(out.to_string_lossy().into_owned()).unwrap();
        assert!(opened.unpacked);
        let main = dir.join("資料").join("資料.deck");
        assert_eq!(PathBuf::from(&opened.path), main);
        assert_eq!(std::fs::read_to_string(&main).unwrap(), text);
        assert_eq!(std::fs::read(dir.join("資料/assets/fig.png")).unwrap(), [0x89, b'P', b'N', b'G', 1, 2, 3]);
        assert_eq!(std::fs::read_to_string(dir.join("資料/widgets/w.html")).unwrap(), "<p>動く</p>");

        // 同じファイルをもう一度開くと、展開し直さずに編集済みのフォルダを開く
        std::fs::write(&main, "{\"edited\":true}\n").unwrap();
        let again = prepare_deck(out.to_string_lossy().into_owned()).unwrap();
        assert_eq!(PathBuf::from(&again.path), main);
        assert_eq!(std::fs::read_to_string(&main).unwrap(), "{\"edited\":true}\n");

        // 展開したフォルダから元のファイルにまとめ直しても、つながりは保つ
        let main_path = main.to_string_lossy().into_owned();
        pack_deck(out.to_string_lossy().into_owned(), "{\"edited\":true}\n".into(), vec![], Some(main_path)).unwrap();
        assert_eq!(PathBuf::from(prepare_deck(out.to_string_lossy().into_owned()).unwrap().path), main);

        // 中身の違うファイルが同じ場所に届いたら、既存のフォルダは上書きせず別のフォルダに展開する
        pack_deck(out.to_string_lossy().into_owned(), "{\"version\":2,\"title\":\"新しい版です\"}\n".into(), vec![], None).unwrap();
        let newer = prepare_deck(out.to_string_lossy().into_owned()).unwrap();
        assert_eq!(PathBuf::from(&newer.path), dir.join("資料 (2)").join("資料.deck"));
        assert_eq!(std::fs::read_to_string(&main).unwrap(), "{\"edited\":true}\n");

        // 展開した本文(テキスト)はそのまま開く
        let plain = prepare_deck(opened.path.clone()).unwrap();
        assert!(!plain.unpacked);
        assert_eq!(plain.path, opened.path);

        // 一時フォルダが残っていない
        let leftovers: Vec<_> = std::fs::read_dir(&dir)
            .unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_name().to_string_lossy().contains("unpacking"))
            .collect();
        assert!(leftovers.is_empty());
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn package_next_to_its_folder_opens_that_folder() {
        // decks/<name>/deck.json(旧形式)を隣の decks/<name>.deck にまとめ、それを開くと元のフォルダを開く
        let dir = temp_dir("sibling");
        let work = dir.join("nn");
        std::fs::create_dir_all(&work).unwrap();
        let main = work.join("deck.json");
        std::fs::write(&main, "{}\n").unwrap();
        let out = dir.join("nn.deck");
        pack_deck(out.to_string_lossy().into_owned(), "{}\n".into(), vec![], Some(main.to_string_lossy().into_owned())).unwrap();
        let opened = prepare_deck(out.to_string_lossy().into_owned()).unwrap();
        assert_eq!(PathBuf::from(&opened.path), main);
        assert!(!dir.join("nn (2)").exists());

        // 隣ではない場所にまとめたときは、元のフォルダに印を付けない
        let other = dir.join("elsewhere.deck");
        pack_deck(other.to_string_lossy().into_owned(), "{}\n".into(), vec![], Some(main.to_string_lossy().into_owned())).unwrap();
        assert_eq!(PathBuf::from(prepare_deck(other.to_string_lossy().into_owned()).unwrap().path), dir.join("elsewhere").join("elsewhere.deck"));
        assert_eq!(PathBuf::from(prepare_deck(out.to_string_lossy().into_owned()).unwrap().path), main);
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn pack_rejects_names_outside_the_folder() {
        let dir = temp_dir("names");
        let src = dir.join("a.png");
        std::fs::write(&src, b"x").unwrap();
        for bad in ["../a.png", "/a.png", "C:/a.png", "assets\\..\\a.png", "assets//a.png", "./a.png", ""] {
            let out = dir.join("x.deck");
            let r = pack_deck(out.to_string_lossy().into_owned(), "{}".into(), vec![entry(bad, &src)], None);
            assert!(r.is_err(), "{bad:?} は拒否されるべき");
            assert!(!out.exists() && !with_suffix(&out, ".tmp").exists());
        }
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn open_rejects_entries_outside_the_folder() {
        for bad in ["../escaped.txt", "a.png:stream"] {
            let dir = temp_dir("zipslip");
            let out = dir.join("evil.deck");
            let mut zip = zip::ZipWriter::new(std::fs::File::create(&out).unwrap());
            zip.start_file(PACKAGE_MAIN, SimpleFileOptions::default()).unwrap();
            zip.write_all(b"{}").unwrap();
            zip.start_file(bad, SimpleFileOptions::default()).unwrap();
            zip.write_all(b"x").unwrap();
            zip.finish().unwrap();

            assert!(prepare_deck(out.to_string_lossy().into_owned()).is_err(), "{bad:?} は拒否されるべき");
            assert!(!dir.join("escaped.txt").exists());
            assert!(!dir.join("evil").exists());
            let names: Vec<String> =
                std::fs::read_dir(&dir).unwrap().filter_map(|e| e.ok()).map(|e| e.file_name().to_string_lossy().into_owned()).collect();
            assert_eq!(names, vec!["evil.deck".to_string()]);
            std::fs::remove_dir_all(&dir).unwrap();
        }
    }

    #[test]
    fn open_requires_deck_body() {
        let dir = temp_dir("nobody");
        let out = dir.join("empty.deck");
        let mut zip = zip::ZipWriter::new(std::fs::File::create(&out).unwrap());
        zip.start_file("assets/a.png", SimpleFileOptions::default()).unwrap();
        zip.write_all(b"x").unwrap();
        zip.finish().unwrap();
        assert!(prepare_deck(out.to_string_lossy().into_owned()).is_err());
        assert!(!dir.join("empty").exists());
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
