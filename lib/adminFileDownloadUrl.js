// storage-js encodes the download query and then encodeURI() encodes its percent
// signs again. Add the original filename only after the signed URL is generated.
export function adminFileDownloadUrl(signedUrl, name) {
  const url = new URL(signedUrl);
  url.searchParams.set("download", name);
  return url.toString();
}
