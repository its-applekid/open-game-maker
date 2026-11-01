# Backup target helpers, sourced by backup.sh and restore.sh.
# OGM_BACKUP_TARGET is ssh:<host>:<path> or local:<path>; the backup set lives in <path>/ogm-backups.
# A leading ~/ in an ssh path is taken relative to the remote home.

target_parse() {
  local target=$1
  case "$target" in
    local:?*)
      target_kind=local
      target_dir=${target#local:}/ogm-backups
      ;;
    ssh:?*:?*)
      local rest=${target#ssh:}
      target_kind=ssh
      target_host=${rest%%:*}
      local path=${rest#*:}
      [[ $path == '~/'* ]] && path=${path#'~/'}
      target_dir=$path/ogm-backups
      printf -v target_qdir '%q' "$target_dir"
      ;;
    *)
      printf 'unknown backup target: %s (want ssh:<host>:<path> or local:<path>)\n' "$target" >&2
      return 1
      ;;
  esac
}

target_ssh() {
  ssh -o BatchMode=yes "$target_host" "$1"
}

# target_put <file> <name>: copy a file into the set; never overwrites.
target_put() {
  local file=$1 name=$2 qname
  if [[ $target_kind == local ]]; then
    install -d -m 0700 "$target_dir"
    [[ ! -e $target_dir/$name ]] || { printf 'target already has %s\n' "$name" >&2; return 1; }
    cp -- "$file" "$target_dir/$name.part"
    mv -n -- "$target_dir/$name.part" "$target_dir/$name"
  else
    printf -v qname '%q' "$name"
    target_ssh "mkdir -p $target_qdir && cd $target_qdir && test ! -e $qname && cat > $qname.part && mv $qname.part $qname" \
      < "$file"
  fi
}

# target_get <name> <file>
target_get() {
  local name=$1 file=$2 qname
  if [[ $target_kind == local ]]; then
    cp -- "$target_dir/$name" "$file"
  else
    printf -v qname '%q' "$name"
    target_ssh "cat $target_qdir/$qname" > "$file"
  fi
}

# target_sha256 <name>...: prints "<sha256>  <name>" lines computed on the far side.
target_sha256() {
  if [[ $target_kind == local ]]; then
    (cd -- "$target_dir" && sha256sum -- "$@")
  else
    local names
    printf -v names '%q ' "$@"
    target_ssh "cd $target_qdir && sha256sum -- $names"
  fi
}
