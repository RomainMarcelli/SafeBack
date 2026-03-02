// Export RGPD: construit un JSON complet des données utilisateur et le partage.
import { Linking, Share } from "react-native";
import { exportMyData, type UserDataExportBundle } from "../core/db";

export type UserDataExportResult = {
  payload: UserDataExportBundle;
  json: string;
  fileUri: string | null;
  fileName: string;
};

function buildExportFileName() {
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  return `safeback-export-${yyyy}${mm}${dd}-${hh}${min}${ss}.json`;
}

function getOptionalExpoFileSystem():
  | null
  | {
      cacheDirectory?: string | null;
      documentDirectory?: string | null;
      EncodingType?: { UTF8?: string };
      writeAsStringAsync?: (
        uri: string,
        contents: string,
        options?: { encoding?: string }
      ) => Promise<void>;
    } {
  try {
    // Import optionnel pour garder la compatibilité même si le module natif n'est pas installé.
    return require("expo-file-system");
  } catch {
    return null;
  }
}

async function writeJsonToFileIfPossible(fileName: string, json: string): Promise<string | null> {
  const fileSystem = getOptionalExpoFileSystem();
  if (!fileSystem?.writeAsStringAsync) return null;
  const directory = fileSystem.cacheDirectory ?? fileSystem.documentDirectory;
  if (!directory) return null;

  const fileUri = `${directory}${fileName}`;
  await fileSystem.writeAsStringAsync(fileUri, json, {
    encoding: fileSystem.EncodingType?.UTF8 ?? "utf8"
  });
  return fileUri;
}

export async function exportAndShareMyDataJson(): Promise<UserDataExportResult> {
  const payload = await exportMyData();
  const json = JSON.stringify(payload, null, 2);
  const fileName = buildExportFileName();
  let fileUri: string | null = null;

  try {
    fileUri = await writeJsonToFileIfPossible(fileName, json);
  } catch {
    fileUri = null;
  }

  if (fileUri) {
    try {
      await Share.share({
        title: "Export de mes données SafeBack (JSON)",
        message: "Export RGPD SafeBack",
        url: fileUri
      });
    } catch {
      await Linking.openURL(fileUri);
    }
  } else {
    // Fallback si le filesystem natif n'est pas présent: partage direct du JSON.
    await Share.share({
      title: "Export de mes données SafeBack (JSON)",
      message: json
    });
  }

  return {
    payload,
    json,
    fileUri,
    fileName
  };
}
