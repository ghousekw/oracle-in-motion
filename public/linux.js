/* =========================================================================
   LINUX MODULE: In-browser Stateful Linux Bash Simulator & Complete Curriculum
   ========================================================================= */

/* ===== LINUX_SIM: In-browser Production Linux Bash Terminal Simulator =====
   Provides a realistic virtual Linux host (prod-db01) with:
   - Stateful filesystem (inodes, modes, ownership, contents, symlinks, mtime, size)
   - Pre-populated realistic production files (/home/oracle, /var/log, /etc, /opt, /u01, /tmp)
   - Systemd services (nginx, payapi, sshd, oracle-free, crond, firewalld)
   - Virtual processes and resource usage (CPU, load average, RAM, disk space, open files)
   - Rich suite of core utilities: ls, cd, pwd, cat, less, head, tail, grep, awk, sed,
     sort, uniq, cut, tr, wc, find, which, chmod, chown, useradd, usermod, id, whoami,
     sudo, ps, pgrep, kill, top, free, df, du, tar, gzip, rsync, ip, ping, ss, lsof,
     curl, systemctl, journalctl, dmesg, crontab, ulimit, sysctl, export, env
   - Pipeline (|), redirection (>, >>, 2>, 2>&1, /dev/null), exit codes ($?), and bash scripting
*/
const LINUX_SIM = (function(){
'use strict';

function cloneDeep(o){
  if(o===null||typeof o!=='object') return o;
  if(Array.isArray(o)) return o.map(cloneDeep);
  const out = {};
  for(const k of Object.keys(o)) out[k] = cloneDeep(o[k]);
  return out;
}

const DEFAULT_USERS = {
  root:   { uid: 0,    gid: 0,    home: '/root',         shell: '/bin/bash', groups: ['root'] },
  oracle: { uid: 1001, gid: 1001, home: '/home/oracle',  shell: '/bin/bash', groups: ['oinstall','dba','wheel'] },
  appuser:{ uid: 1002, gid: 1002, home: '/home/appuser', shell: '/bin/bash', groups: ['appgrp'] },
  nginx:  { uid: 998,  gid: 998,  home: '/var/cache/nginx', shell: '/sbin/nologin', groups: ['nginx'] }
};

const DEFAULT_GROUPS = {
  root: 0, oinstall: 1001, dba: 1002, appgrp: 1003, wheel: 10, nginx: 998
};

const DEFAULT_SERVICES = {
  nginx:       { name: 'nginx',       active: true,  enabled: true,  desc: 'The NGINX HTTP and reverse proxy server', port: 80 },
  payapi:      { name: 'payapi',      active: true,  enabled: true,  desc: 'Payment Gateway Core Microservice', port: 8080 },
  sshd:        { name: 'sshd',        active: true,  enabled: true,  desc: 'OpenSSH server daemon', port: 22 },
  'oracle-free':{ name: 'oracle-free', active: true, enabled: true,  desc: 'Oracle Database 23ai Free Service', port: 1521 },
  crond:       { name: 'crond',       active: true,  enabled: true,  desc: 'Command Scheduler', port: null },
  firewalld:   { name: 'firewalld',   active: true,  enabled: true,  desc: 'firewalld - dynamic firewall daemon', port: null }
};

const SAMPLE_LOGS = {
  syslog: [
    'Oct 29 06:15:01 prod-db01 CRON[12044]: (root) CMD (/usr/local/bin/logrotate /etc/logrotate.conf)',
    'Oct 29 07:00:12 prod-db01 systemd[1]: Starting Daily apt download activities...',
    'Oct 29 07:00:18 prod-db01 systemd[1]: apt-daily.service: Deactivated successfully.',
    'Oct 29 08:30:22 prod-db01 kernel: [ 4521.120] e1000e 0000:00:1f.6 eth0: NIC Link is Up 1000 Mbps Full Duplex',
    'Oct 29 09:14:55 prod-db01 sshd[15402]: Accepted publickey for oracle from 10.0.1.25 port 54112 ssh2: ED25519',
    'Oct 29 09:20:14 prod-db01 payapi[1420]: ERROR org.hibernate.engine.jdbc.spi.SqlExceptionHelper - Connection refused',
    'Oct 29 10:22:01 prod-db01 kernel: [ 9812.304] TCP: request_sock_TCP: Possible SYN flooding on port 80. Dropping request.',
    'Oct 29 11:45:00 prod-db01 systemd[1]: Reloading The NGINX HTTP and reverse proxy server...',
    'Oct 29 11:45:01 prod-db01 systemd[1]: Reloaded The NGINX HTTP and reverse proxy server.',
    'Oct 29 12:01:10 prod-db01 kernel: [14201.550] Out of memory: Kill process 18204 (java_worker) score 720 or sacrifice child',
    'Oct 29 12:05:00 prod-db01 systemd[1]: payapi.service: Main process exited, code=exited, status=1/FAILURE',
    'Oct 29 12:05:01 prod-db01 systemd[1]: payapi.service: Failed with result "exit-code", ERROR state logged.'
  ].join('\n'),

  auth: [
    'Oct 29 02:11:04 prod-db01 sshd[8412]: Failed password for invalid user admin from 203.0.113.45 port 41232 ssh2',
    'Oct 29 02:11:08 prod-db01 sshd[8414]: Failed password for invalid user admin from 203.0.113.45 port 41238 ssh2',
    'Oct 29 02:11:15 prod-db01 sshd[8419]: Failed password for invalid user root from 203.0.113.45 port 41244 ssh2',
    'Oct 29 03:40:22 prod-db01 sshd[9104]: Failed password for invalid user test from 198.51.100.18 port 50114 ssh2',
    'Oct 29 03:40:26 prod-db01 sshd[9106]: Failed password for invalid user ubuntu from 198.51.100.18 port 50118 ssh2',
    'Oct 29 04:15:30 prod-db01 sshd[9840]: Failed password for oracle from 192.168.1.105 port 58920 ssh2',
    'Oct 29 04:15:45 prod-db01 sshd[9840]: Accepted password for oracle from 192.168.1.105 port 58920 ssh2',
    'Oct 29 09:14:55 prod-db01 sshd[15402]: Accepted publickey for oracle from 10.0.1.25 port 54112 ssh2: ED25519',
    'Oct 29 10:02:10 prod-db01 sudo: oracle : TTY=pts/0 ; PWD=/home/oracle ; USER=root ; COMMAND=/bin/systemctl reload nginx'
  ].join('\n'),

  access: [
    '10.0.1.12 - - [29/Oct/2026:10:14:01 +0000] "GET /api/orders HTTP/1.1" 200 1420 "https://app.company.com" "Mozilla/5.0"',
    '192.168.1.50 - - [29/Oct/2026:10:14:02 +0000] "GET /health HTTP/1.1" 200 45 "-" "curl/7.88.1"',
    '203.0.113.9 - - [29/Oct/2026:10:14:05 +0000] "POST /api/checkout HTTP/1.1" 500 284 "https://app.company.com" "Mozilla/5.0"',
    '203.0.113.9 - - [29/Oct/2026:10:14:08 +0000] "POST /api/checkout HTTP/1.1" 500 284 "https://app.company.com" "Mozilla/5.0"',
    '10.0.1.14 - - [29/Oct/2026:10:14:15 +0000] "GET /api/products HTTP/1.1" 200 9840 "https://app.company.com" "Mozilla/5.0"',
    '198.51.100.7 - - [29/Oct/2026:10:14:22 +0000] "GET /wp-login.php HTTP/1.1" 404 162 "-" "curl/7.68.0"',
    '10.0.1.12 - - [29/Oct/2026:10:14:30 +0000] "GET /api/customers HTTP/1.1" 200 3210 "https://app.company.com" "Mozilla/5.0"',
    '203.0.113.9 - - [29/Oct/2026:10:14:41 +0000] "POST /api/checkout HTTP/1.1" 500 284 "https://app.company.com" "Mozilla/5.0"',
    '10.0.1.80 - - [29/Oct/2026:10:15:00 +0000] "GET /api/orders/501 HTTP/1.1" 200 680 "https://app.company.com" "Mozilla/5.0"',
    '198.51.100.7 - - [29/Oct/2026:10:15:05 +0000] "GET /.env HTTP/1.1" 404 162 "-" "Python-urllib/3.9"'
  ].join('\n'),

  error: [
    '2026/10/29 10:14:05 [error] 1420#1420: *502 connect() failed (111: Connection refused) while connecting to upstream, client: 203.0.113.9, server: api.company.com, request: "POST /api/checkout HTTP/1.1", upstream: "http://127.0.0.1:8080/checkout"',
    '2026/10/29 10:14:08 [error] 1420#1420: *503 connect() failed (111: Connection refused) while connecting to upstream, client: 203.0.113.9, server: api.company.com, request: "POST /api/checkout HTTP/1.1", upstream: "http://127.0.0.1:8080/checkout"'
  ].join('\n'),

  alertOracle: [
    '2026-10-29T08:00:15.120+00:00',
    'Starting ORACLE instance (normal) (FREE)',
    'LICENSE_MAX_SESSION = 0',
    'LICENSE_SESSIONS_WARNING = 0',
    'Initial number of CPU is 4',
    'Number of processor sockets is 1',
    '2026-10-29T08:00:22.405+00:00',
    'Completed: ALTER DATABASE OPEN',
    '2026-10-29T09:40:12.880+00:00',
    'ORA-01653: unable to extend table OT.ORDERS by 128 in tablespace USERS',
    '2026-10-29T10:15:33.210+00:00',
    'Thread 1 advanced to log sequence 42 (LGWR switch)',
    '  Current log# 2 seq# 42 mem# 0: /u01/app/oracle/oradata/FREE/redo02.log'
  ].join('\n')
};

function initialFs(){
  let nextInode = 100;
  function mkDir(owner, group, mode){
    return { type: 'dir', inode: nextInode++, owner, group, mode, mtime: 'Oct 29 10:00', entries: {} };
  }
  function mkFile(owner, group, mode, content, size){
    const cnt = content == null ? '' : String(content);
    const sz = size != null ? size : cnt.length;
    return { type: 'file', inode: nextInode++, owner, group, mode, mtime: 'Oct 29 10:00', content: cnt, size: sz };
  }
  function mkLink(owner, group, target){
    return { type: 'link', inode: nextInode++, owner, group, mode: 0o777, mtime: 'Oct 29 10:00', target };
  }

  const root = mkDir('root', 'root', 0o755);
  root.entries['root'] = mkDir('root', 'root', 0o700);
  root.entries['home'] = mkDir('root', 'root', 0o755);
  root.entries['var']  = mkDir('root', 'root', 0o755);
  root.entries['etc']  = mkDir('root', 'root', 0o755);
  root.entries['opt']  = mkDir('root', 'root', 0o755);
  root.entries['tmp']  = mkDir('root', 'root', 0o1777); // sticky bit!
  root.entries['u01']  = mkDir('oracle', 'oinstall', 0o755);
  root.entries['bin']  = mkDir('root', 'root', 0o755);
  const uDir = mkDir('root', 'root', 0o755);
  root.entries['usr']  = uDir;
  root.entries['proc'] = mkDir('root', 'root', 0o555);

  const uBin = mkDir('root', 'root', 0o755);
  const uSbin = mkDir('root', 'root', 0o755);
  uDir.entries['bin'] = uBin;
  uDir.entries['sbin'] = uSbin;
  uSbin.entries['nginx'] = mkFile('root', 'root', 0o755, '#!/bin/sh\n');
  uSbin.entries['sshd'] = mkFile('root', 'root', 0o755, '#!/bin/sh\n');
  ['python3','node','java','curl','grep','awk','sed','tar','rsync','bash','sh','top','free','df','du'].forEach(b => {
    uBin.entries[b] = mkFile('root', 'root', 0o755, '#!/bin/sh\n');
  });

  // /tmp files
  root.entries['tmp'].entries['sess_01.tmp'] = mkFile('oracle', 'oinstall', 0o600, 'session_token=xyz987\n');
  root.entries['tmp'].entries['debug.log'] = mkFile('appuser', 'appgrp', 0o644, 'debug init\n');

  // /home/oracle
  const oHome = mkDir('oracle', 'oinstall', 0o750);
  root.entries['home'].entries['oracle'] = oHome;

  oHome.entries['notes.txt'] = mkFile('oracle', 'oinstall', 0o644,
    '=== Oracle DBA & Linux Daily Checklist ===\n' +
    '1. Check disk space: df -h\n' +
    '2. Check alert log for ORA- errors: tail -n 50 /var/log/oracle/alert_FREE.log\n' +
    '3. Check CPU & RAM load: top and free -h\n' +
    '4. Check listener status: lsnrctl status\n' +
    '5. Check backups completed: ls -ltr /u01/app/oracle/backup/\n'
  );

  oHome.entries['todo.txt'] = mkFile('oracle', 'oinstall', 0o644,
    'backup database\n' +
    'rotate logs\n' +
    'check disk\n' +
    'backup database\n' +
    'review slow queries\n' +
    'rotate logs\n' +
    'apply security patch\n'
  );

  oHome.entries['servers.csv'] = mkFile('oracle', 'oinstall', 0o644,
    'hostname,ip,role,cpu,ram_gb,region\n' +
    'prod-db01,10.0.1.10,database,16,64,eu-west\n' +
    'prod-db02,10.0.1.11,database-standby,16,64,eu-west\n' +
    'prod-app01,10.0.1.20,backend,8,32,eu-west\n' +
    'prod-app02,10.0.1.21,backend,8,32,eu-west\n' +
    'prod-web01,10.0.1.30,loadbalancer,4,16,eu-west\n' +
    'prod-web02,10.0.1.31,loadbalancer,4,16,eu-west\n' +
    'stage-db01,10.0.2.10,database,8,32,us-east\n' +
    'stage-app01,10.0.2.20,backend,4,16,us-east\n'
  );

  oHome.entries['employees.csv'] = mkFile('oracle', 'oinstall', 0o644,
    'id,name,dept,salary,status\n' +
    '101,Aarav,Engineering,85000,active\n' +
    '102,Fatima,Engineering,92000,active\n' +
    '103,Zayd,Operations,62000,active\n' +
    '104,Priya,Sales,71000,active\n' +
    '105,Rohan,Engineering,78000,leave\n' +
    '106,Sara,Operations,59000,active\n' +
    '107,Karan,Sales,68000,active\n' +
    '108,Alina,Finance,95000,active\n'
  );

  oHome.entries['.bashrc'] = mkFile('oracle', 'oinstall', 0o644,
    '# .bashrc\n' +
    'alias ll="ls -la"\n' +
    'alias ltr="ls -ltr"\n' +
    'alias dfh="df -h"\n' +
    'export PS1="\\u@\\h:\\w\\$ "\n'
  );

  oHome.entries['.bash_profile'] = mkFile('oracle', 'oinstall', 0o644,
    '# .bash_profile\n' +
    'export ORACLE_BASE=/u01/app/oracle\n' +
    'export ORACLE_HOME=/u01/app/oracle/product/23ai/dbhome_1\n' +
    'export ORACLE_SID=FREE\n' +
    'export PATH=$PATH:$ORACLE_HOME/bin\n'
  );

  // .ssh
  const oSsh = mkDir('oracle', 'oinstall', 0o700);
  oHome.entries['.ssh'] = oSsh;
  oSsh.entries['id_ed25519'] = mkFile('oracle', 'oinstall', 0o600,
    '-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW\nQyNTUxOQAAACBP25Nn...[oracle private key]...==\n-----END OPENSSH PRIVATE KEY-----\n'
  );
  oSsh.entries['id_ed25519.pub'] = mkFile('oracle', 'oinstall', 0o644,
    'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIBP25Nn7Q+3Gf7a oracle@prod-db01\n'
  );
  oSsh.entries['authorized_keys'] = mkFile('oracle', 'oinstall', 0o600,
    'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIBP25Nn7Q+3Gf7a oracle@prod-db01\n' +
    'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIHY7xW91qL5mK1a devops-lead@bastion\n'
  );
  oSsh.entries['config'] = mkFile('oracle', 'oinstall', 0o600,
    'Host backup-srv\n  HostName 10.0.1.99\n  User backupuser\n  IdentityFile ~/.ssh/id_ed25519\n'
  );

  // scripts
  const oScripts = mkDir('oracle', 'oinstall', 0o755);
  oHome.entries['scripts'] = oScripts;
  // healthcheck.sh initially 644 so learner can chmod +x it!
  oScripts.entries['healthcheck.sh'] = mkFile('oracle', 'oinstall', 0o755,
    '#!/bin/bash\n' +
    'echo "=== System Health ==="\n' +
    'uptime\n' +
    'df -h /\n' +
    'free -h\n'
  );
  oScripts.entries['backup_db.sh'] = mkFile('oracle', 'oinstall', 0o755,
    '#!/bin/bash\n' +
    'set -euo pipefail\n' +
    'BACKUP_DIR="/u01/app/oracle/backup"\n' +
    'DATE=$(date +%F)\n' +
    'echo "Starting backup for ${DATE}..."\n' +
    'tar -czf "${BACKUP_DIR}/db_backup_${DATE}.tar.gz" -C /u01/app/oracle/oradata FREE\n' +
    'echo "Backup completed: ${BACKUP_DIR}/db_backup_${DATE}.tar.gz"\n'
  );
  oScripts.entries['cleanup_logs.sh'] = mkFile('oracle', 'oinstall', 0o755,
    '#!/bin/bash\n' +
    'find /var/log/app -name "*.tmp" -mtime +7 -delete\n' +
    'echo "Cleaned old temporary files."\n'
  );

  // releases with symlink
  const oReleases = mkDir('oracle', 'oinstall', 0o755);
  oHome.entries['releases'] = oReleases;
  oReleases.entries['app-v1.0'] = mkDir('oracle', 'oinstall', 0o755);
  oReleases.entries['app-v1.0'].entries['version.txt'] = mkFile('oracle', 'oinstall', 0o644, 'v1.0.0\n');
  oReleases.entries['app-v1.1'] = mkDir('oracle', 'oinstall', 0o755);
  oReleases.entries['app-v1.1'].entries['version.txt'] = mkFile('oracle', 'oinstall', 0o644, 'v1.1.0\n');
  oReleases.entries['current'] = mkLink('oracle', 'oinstall', '/home/oracle/releases/app-v1.1');

  // app config
  const oApp = mkDir('oracle', 'oinstall', 0o755);
  oHome.entries['app'] = oApp;
  oApp.entries['app.env'] = mkFile('oracle', 'oinstall', 0o644,
    'PORT=3000\n' +
    'APP_ENV=dev\n' +
    'DB_HOST=localhost\n' +
    'DB_PORT=1521\n'
  );
  oApp.entries['package.json'] = mkFile('oracle', 'oinstall', 0o644, '{\n  "name": "payment-api",\n  "version": "1.0.0"\n}\n');
  oApp.entries['server.js'] = mkFile('oracle', 'oinstall', 0o644, 'console.log("Server listening on port 8080");\n');
  oApp.entries['config.env'] = mkFile('oracle', 'oinstall', 0o644,
    'APP_ENV=production\n' +
    'PORT=8080\n' +
    'DB_HOST=127.0.0.1\n' +
    'DB_PORT=1521\n' +
    'DB_NAME=FREE\n' +
    'LOG_LEVEL=debug\n'
  );

  // /var/log
  const vLog = mkDir('root', 'root', 0o755);
  root.entries['var'].entries['log'] = vLog;
  vLog.entries['syslog'] = mkFile('root', 'root', 0o640, SAMPLE_LOGS.syslog);
  vLog.entries['syslog.1.old'] = mkFile('root', 'root', 0o640, 'archived old syslog contents\n');
  vLog.entries['auth.log'] = mkFile('root', 'root', 0o640, SAMPLE_LOGS.auth);

  const vNginx = mkDir('nginx', 'root', 0o755);
  vLog.entries['nginx'] = vNginx;
  vNginx.entries['access.log'] = mkFile('nginx', 'root', 0o644, SAMPLE_LOGS.access);
  vNginx.entries['error.log'] = mkFile('nginx', 'root', 0o644, SAMPLE_LOGS.error);

  const vOracle = mkDir('oracle', 'oinstall', 0o755);
  vLog.entries['oracle'] = vOracle;
  vOracle.entries['alert_FREE.log'] = mkFile('oracle', 'oinstall', 0o644, SAMPLE_LOGS.alertOracle);

  const vApp = mkDir('oracle', 'oinstall', 0o755);
  vLog.entries['app'] = vApp;
  vApp.entries['app.log'] = mkFile('oracle', 'oinstall', 0o644, '2026-10-29 10:14:00 [INFO] Server started on port 8080\n');
  vApp.entries['old_2025.tmp'] = mkFile('oracle', 'oinstall', 0o644, 'dummy old temp log content\n', 450 * 1024 * 1024); // 450MB virtual size!
  vApp.entries['crashdump.tmp'] = mkFile('oracle', 'oinstall', 0o644, 'core dump data\n', 800 * 1024 * 1024); // 800MB virtual size!

  // /etc
  const etc = root.entries['etc'];
  etc.entries['cron.d'] = mkDir('root', 'root', 0o755);
  etc.entries['cron.daily'] = mkDir('root', 'root', 0o755);
  etc.entries['cron.hourly'] = mkDir('root', 'root', 0o755);
  etc.entries['cron.monthly'] = mkDir('root', 'root', 0o755);
  etc.entries['cron.weekly'] = mkDir('root', 'root', 0o755);
  etc.entries['hostname'] = mkFile('root', 'root', 0o644, 'prod-db01\n');
  etc.entries['os-release'] = mkFile('root', 'root', 0o644,
    'NAME="Oracle Linux Server"\n' +
    'VERSION="9.4"\n' +
    'ID="ol"\n' +
    'PRETTY_NAME="Oracle Linux Server 9.4"\n'
  );
  etc.entries['hosts'] = mkFile('root', 'root', 0o644,
    '127.0.0.1   localhost localhost.localdomain\n' +
    '10.0.1.10   prod-db01 prod-db01.corp.internal\n' +
    '10.0.1.11   prod-db02\n' +
    '10.0.1.20   prod-app01\n'
  );
  etc.entries['resolv.conf'] = mkFile('root', 'root', 0o644,
    'nameserver 10.0.0.2\n' +
    'nameserver 8.8.8.8\n' +
    'search corp.internal\n'
  );
  etc.entries['fstab'] = mkFile('root', 'root', 0o644,
    '# /etc/fstab\n' +
    'UUID=3a1b2c3d-0001 / ext4 defaults 0 1\n' +
    'UUID=3a1b2c3d-0002 /var/log ext4 defaults 0 2\n' +
    'UUID=3a1b2c3d-0003 /u01 ext4 defaults,noatime 0 2\n' +
    '/swapfile none swap sw 0 0\n'
  );
  etc.entries['sysctl.conf'] = mkFile('root', 'root', 0o644,
    '# Oracle Linux Kernel Parameters\n' +
    'fs.file-max = 6815744\n' +
    'kernel.sem = 250 32000 100 128\n' +
    'kernel.shmmax = 34359738368\n' +
    'kernel.shmall = 8388608\n' +
    'vm.swappiness = 10\n' +
    'vm.nr_hugepages = 1024\n'
  );

  const secLim = mkDir('root', 'root', 0o755);
  etc.entries['security'] = secLim;
  secLim.entries['limits.conf'] = mkFile('root', 'root', 0o644,
    '# /etc/security/limits.conf\n' +
    'oracle   soft   nofile    1024\n' +
    'oracle   hard   nofile    65536\n' +
    'oracle   soft   nproc     2047\n' +
    'oracle   hard   nproc     16384\n' +
    'oracle   soft   stack     10240\n' +
    'oracle   hard   stack     32768\n' +
    'oracle   soft   memlock   unlimited\n' +
    'oracle   hard   memlock   unlimited\n'
  );

  const etcSsh = mkDir('root', 'root', 0o755);
  etc.entries['ssh'] = etcSsh;
  etcSsh.entries['sshd_config'] = mkFile('root', 'root', 0o600,
    'Port 22\n' +
    'PermitRootLogin prohibit-password\n' +
    'PasswordAuthentication yes\n' +
    'PubkeyAuthentication yes\n' +
    'AuthorizedKeysFile .ssh/authorized_keys\n'
  );

  etc.entries['passwd'] = mkFile('root', 'root', 0o644,
    'root:x:0:0:root:/root:/bin/bash\n' +
    'bin:x:1:1:bin:/bin:/sbin/nologin\n' +
    'nginx:x:998:998:Nginx web server:/var/cache/nginx:/sbin/nologin\n' +
    'oracle:x:1001:1001:Oracle DBA:/home/oracle:/bin/bash\n' +
    'appuser:x:1002:1002:Application Service:/home/appuser:/bin/bash\n'
  );

  etc.entries['group'] = mkFile('root', 'root', 0o644,
    'root:x:0:\n' +
    'wheel:x:10:oracle\n' +
    'nginx:x:998:\n' +
    'oinstall:x:1001:oracle\n' +
    'dba:x:1002:oracle\n' +
    'appgrp:x:1003:appuser\n'
  );

  etc.entries['crontab'] = mkFile('root', 'root', 0o644,
    'SHELL=/bin/bash\n' +
    'PATH=/sbin:/bin:/usr/sbin:/usr/bin\n' +
    'MAILTO=root\n' +
    '# m h dom mon dow user command\n' +
    '0 2 * * * root /usr/sbin/logrotate /etc/logrotate.conf\n' +
    '0 3 * * * oracle /home/oracle/scripts/backup_db.sh >> /var/log/oracle/backup.log 2>&1\n'
  );

  // /u01
  const u01 = root.entries['u01'];
  const uApp = mkDir('oracle', 'oinstall', 0o755);
  u01.entries['app'] = uApp;
  const uOra = mkDir('oracle', 'oinstall', 0o755);
  uApp.entries['oracle'] = uOra;
  const uData = mkDir('oracle', 'oinstall', 0o755);
  uOra.entries['oradata'] = uData;
  const uFree = mkDir('oracle', 'oinstall', 0o755);
  uData.entries['FREE'] = uFree;
  uFree.entries['system01.dbf'] = mkFile('oracle', 'oinstall', 0o640, '', 1024 * 1024 * 1024);
  uFree.entries['users01.dbf'] = mkFile('oracle', 'oinstall', 0o640, '', 512 * 1024 * 1024);
  uFree.entries['redo01.log'] = mkFile('oracle', 'oinstall', 0o640, '', 100 * 1024 * 1024);
  uFree.entries['redo02.log'] = mkFile('oracle', 'oinstall', 0o640, '', 100 * 1024 * 1024);
  uFree.entries['control01.ctl'] = mkFile('oracle', 'oinstall', 0o640, '', 20 * 1024 * 1024);

  const uBack = mkDir('oracle', 'oinstall', 0o755);
  uOra.entries['backup'] = uBack;
  uBack.entries['db_backup_2026-10-28.tar.gz'] = mkFile('oracle', 'oinstall', 0o640, '', 320 * 1024 * 1024);

  return root;
}

function create(opts){
  opts = opts || {};
  let root = initialFs();
  let user = 'oracle';
  let cwd = '/home/oracle';
  let umask = 0o022;
  let services = cloneDeep(DEFAULT_SERVICES);
  let users = cloneDeep(DEFAULT_USERS);
  let groups = cloneDeep(DEFAULT_GROUPS);
  let env = {
    USER: 'oracle',
    HOME: '/home/oracle',
    SHELL: '/bin/bash',
    PATH: '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/u01/app/oracle/product/23ai/dbhome_1/bin',
    ORACLE_BASE: '/u01/app/oracle',
    ORACLE_HOME: '/u01/app/oracle/product/23ai/dbhome_1',
    ORACLE_SID: 'FREE',
    HOSTNAME: 'prod-db01',
    LANG: 'en_US.UTF-8'
  };
  let cronTabs = {
    oracle: '0 3 * * * /home/oracle/scripts/backup_db.sh >> /var/log/oracle/backup.log 2>&1\n',
    root: '0 2 * * * /usr/sbin/logrotate /etc/logrotate.conf\n'
  };
  let ulimits = {
    nofile: { soft: 1024, hard: 65536 },
    nproc:  { soft: 2047, hard: 16384 },
    stack:  { soft: 10240, hard: 32768 }
  };
  let sysctls = {
    'fs.file-max': '6815744',
    'vm.swappiness': '10',
    'vm.nr_hugepages': '1024',
    'kernel.sem': '250 32000 100 128'
  };
  let firewall = {
    status: 'active',
    ports: ['22/tcp', '80/tcp', '443/tcp', '1521/tcp']
  };
  let lastExitCode = 0;
  let runningProcesses = [
    { pid: 1,    user: 'root',   cpu: 0.0, mem: 0.1, cmd: '/sbin/init' },
    { pid: 480,  user: 'root',   cpu: 0.0, mem: 0.1, cmd: '/usr/lib/systemd/systemd-journald' },
    { pid: 720,  user: 'root',   cpu: 0.0, mem: 0.1, cmd: '/usr/sbin/crond -n' },
    { pid: 810,  user: 'root',   cpu: 0.0, mem: 0.2, cmd: 'sshd: /usr/sbin/sshd -D [listener]' },
    { pid: 1102, user: 'root',   cpu: 0.0, mem: 0.3, cmd: 'nginx: master process /usr/sbin/nginx' },
    { pid: 1103, user: 'nginx',  cpu: 0.1, mem: 0.8, cmd: 'nginx: worker process' },
    { pid: 1420, user: 'oracle', cpu: 0.2, mem: 4.2, cmd: 'java -jar /opt/payapi/server.jar --port=8080' },
    { pid: 2100, user: 'oracle', cpu: 0.5, mem: 12.5, cmd: 'xe_pmon_FREE' },
    { pid: 2102, user: 'oracle', cpu: 0.1, mem: 8.0,  cmd: 'xe_dbw0_FREE' },
    { pid: 2104, user: 'oracle', cpu: 0.3, mem: 6.5,  cmd: 'xe_lgwr_FREE' },
    { pid: 2106, user: 'oracle', cpu: 0.1, mem: 4.0,  cmd: 'xe_ckpt_FREE' },
    { pid: 2108, user: 'oracle', cpu: 0.1, mem: 5.0,  cmd: 'xe_smon_FREE' },
    { pid: 2110, user: 'oracle', cpu: 0.0, mem: 2.5,  cmd: '/u01/app/oracle/product/23ai/bin/tnslsnr LISTENER -inherit' },
    { pid: 3840, user: 'oracle', cpu: 0.0, mem: 0.2, cmd: '-bash' }
  ];
  let deletedOpenFiles = [
    { cmd: 'java', pid: 1420, user: 'oracle', fd: '4u', size: '1.2G', path: '/var/log/app/old_app.log (deleted)' }
  ];

  /* Path resolution helpers */
  function normalize(p){
    if(!p) return cwd;
    p = p.trim();
    if(p === '~' || p.startsWith('~/')) p = (user === 'root' ? '/root' : '/home/' + user) + p.slice(1);
    if(!p.startsWith('/')) p = (cwd === '/' ? '/' : cwd + '/') + p;
    const parts = p.split('/').filter(Boolean);
    const stack = [];
    for(const part of parts){
      if(part === '.') continue;
      if(part === '..'){ if(stack.length) stack.pop(); }
      else stack.push(part);
    }
    return '/' + stack.join('/');
  }

  function resolve(absPath, followSymlink){
    if(absPath === '/') return { node: root, parent: null, name: '' };
    const parts = absPath.split('/').filter(Boolean);
    let cur = root;
    let par = null;
    let name = '';
    let depth = 0;
    for(let i = 0; i < parts.length; i++){
      name = parts[i];
      par = cur;
      if(!cur.entries || cur.type !== 'dir') return null;
      let next = cur.entries[name];
      if(!next) return null;
      if(next.type === 'link' && (followSymlink || i < parts.length - 1)){
        if(++depth > 12) return null; // circular link loop protection
        const targetAbs = normalize(next.target.startsWith('/') ? next.target : parts.slice(0, i).concat(next.target).join('/'));
        const targetRes = resolve(targetAbs, true);
        if(!targetRes) return null;
        next = targetRes.node;
      }
      cur = next;
    }
    return { node: cur, parent: par, name };
  }

  function formatPerm(mode, isDir, isLink){
    const prefix = isLink ? 'l' : isDir ? 'd' : '-';
    const m = mode || 0o644;
    const rwx = [
      (m & 0o400)?'r':'-', (m & 0o200)?'w':'-', (m & 0o4000)?((m & 0o100)?'s':'S'):((m & 0o100)?'x':'-'),
      (m & 0o040)?'r':'-', (m & 0o020)?'w':'-', (m & 0o2000)?((m & 0o010)?'s':'S'):((m & 0o010)?'x':'-'),
      (m & 0o004)?'r':'-', (m & 0o002)?'w':'-', (m & 0o1000)?((m & 0o001)?'t':'T'):((m & 0o001)?'x':'-')
    ].join('');
    return prefix + rwx;
  }

  function formatSize(sz){
    if(sz == null) return '0';
    if(typeof sz === 'string') return sz;
    if(sz >= 1024 * 1024 * 1024) return (sz / (1024 * 1024 * 1024)).toFixed(1) + 'G';
    if(sz >= 1024 * 1024) return (sz / (1024 * 1024)).toFixed(1) + 'M';
    if(sz >= 1024) return (sz / 1024).toFixed(1) + 'K';
    return String(sz);
  }

  return {
    state(){
      return {
        user, cwd, env, services, users, groups, ulimits, sysctls, firewall,
        deletedOpenFiles, runningProcesses
      };
    },
    prompt(){
      const shortCwd = cwd === (user === 'root' ? '/root' : '/home/' + user) ? '~' : (cwd.length > 22 ? '...' + cwd.slice(-18) : cwd);
      const sign = user === 'root' ? '#' : '$';
      return `${user}@prod-db01:${shortCwd}${sign} `;
    },
    isComplete(text){
      const t = String(text).trim();
      if(!t) return true;
      if(t.endsWith('\\')) return false;
      // unclosed single quotes
      let sq = 0, dq = 0;
      for(let i = 0; i < t.length; i++){
        if(t[i] === "'" && (i === 0 || t[i-1] !== '\\') && dq % 2 === 0) sq++;
        else if(t[i] === '"' && (i === 0 || t[i-1] !== '\\') && sq % 2 === 0) dq++;
      }
      if(sq % 2 !== 0 || dq % 2 !== 0) return false;
      // block structures
      if(/\b(if|for|while)\b/.test(t)){
        const ifCt = (t.match(/\bif\b/g)||[]).length, fiCt = (t.match(/\bfi\b/g)||[]).length;
        if(ifCt > fiCt) return false;
        const doCt = (t.match(/\bdo\b/g)||[]).length, doneCt = (t.match(/\bdone\b/g)||[]).length;
        if(doCt > doneCt) return false;
      }
      return true;
    },
    reset(){
      root = initialFs();
      user = 'oracle';
      cwd = '/home/oracle';
      services = cloneDeep(DEFAULT_SERVICES);
      users = cloneDeep(DEFAULT_USERS);
      groups = cloneDeep(DEFAULT_GROUPS);
      cronTabs = {
        oracle: '0 3 * * * /home/oracle/scripts/backup_db.sh >> /var/log/oracle/backup.log 2>&1\n',
        root: '0 2 * * * /usr/sbin/logrotate /etc/logrotate.conf\n'
      };
      ulimits = {
        nofile: { soft: 1024, hard: 65536 },
        nproc:  { soft: 2047, hard: 16384 },
        stack:  { soft: 10240, hard: 32768 }
      };
      sysctls = {
        'fs.file-max': '6815744',
        'vm.swappiness': '10',
        'vm.nr_hugepages': '1024',
        'kernel.sem': '250 32000 100 128'
      };
      lastExitCode = 0;
    },
    clone(){
      const next = create();
      next._load(this._dump());
      return next;
    },
    _dump(){
      return {
        root: cloneDeep(root),
        user, cwd, umask, services: cloneDeep(services), users: cloneDeep(users),
        groups: cloneDeep(groups), env: cloneDeep(env), cronTabs: cloneDeep(cronTabs),
        ulimits: cloneDeep(ulimits), sysctls: cloneDeep(sysctls), firewall: cloneDeep(firewall),
        lastExitCode
      };
    },
    _load(st){
      root = cloneDeep(st.root);
      user = st.user;
      cwd = st.cwd;
      umask = st.umask;
      services = cloneDeep(st.services);
      users = cloneDeep(st.users);
      groups = cloneDeep(st.groups);
      env = cloneDeep(st.env);
      cronTabs = cloneDeep(st.cronTabs);
      ulimits = cloneDeep(st.ulimits);
      sysctls = cloneDeep(st.sysctls);
      firewall = cloneDeep(st.firewall);
      lastExitCode = st.lastExitCode || 0;
    },
    fingerprint(){
      // Hash of all modified files, permissions, services, users, limits
      const parts = [];
      function walk(n, path){
        if(n.type === 'file'){
          parts.push(`${path}:f:${(n.mode||0).toString(8)}:${n.owner}:${n.group}:${n.size}:${n.content.slice(0, 100).replace(/\s+/g,'_')}`);
        } else if(n.type === 'link'){
          parts.push(`${path}:l:${n.target}`);
        } else if(n.type === 'dir'){
          parts.push(`${path}:d:${(n.mode||0).toString(8)}:${n.owner}:${n.group}`);
          for(const k of Object.keys(n.entries).sort()){
            walk(n.entries[k], path === '/' ? '/' + k : path + '/' + k);
          }
        }
      }
      walk(root, '/');
      for(const s of Object.keys(services).sort()){
        parts.push(`svc:${s}:${services[s].active}:${services[s].enabled}`);
      }
      for(const u of Object.keys(users).sort()){
        parts.push(`u:${u}:${users[u].uid}:${users[u].gid}`);
      }
      for(const k of Object.keys(cronTabs).sort()){
        parts.push(`cron:${k}:${cronTabs[k].trim()}`);
      }
      parts.push(`user:${user}:cwd:${cwd}:umask:${umask.toString(8)}:exit:${lastExitCode}`);
      return parts.join('\n');
    },

    // File system inspection API for UI explorer
    listFiles(dirPath){
      const abs = normalize(dirPath || cwd);
      const res = resolve(abs, true);
      if(!res || res.node.type !== 'dir') return [];
      const list = [];
      for(const name of Object.keys(res.node.entries).sort()){
        const n = res.node.entries[name];
        list.push({
          name,
          type: n.type,
          mode: (n.mode || 0o644).toString(8),
          owner: n.owner,
          group: n.group,
          size: n.type === 'file' ? formatSize(n.size) : n.type === 'dir' ? '4.0K' : 'link',
          target: n.target || null
        });
      }
      return list;
    },

    readFile(filePath){
      const abs = normalize(filePath);
      const res = resolve(abs, true);
      if(!res || res.node.type !== 'file') return null;
      return res.node.content;
    },

    /* Execute terminal bash command string */
    run(rawText){
      const lines = [];
      const out = {
        say: (t) => lines.push({ k: 'out', t: String(t) }),
        ok:  (t) => lines.push({ k: 'ok',  t: String(t) }),
        err: (t) => lines.push({ k: 'err', t: String(t) }),
        dim: (t) => lines.push({ k: 'dim', t: String(t) })
      };

      // Split multiline input into statements or handle single block
      const rawLines = String(rawText).split('\n');
      for(let li = 0; li < rawLines.length; li++){
        let l = rawLines[li].trim();
        if(!l || l.startsWith('#')){
          // Comments or blank
          continue;
        }

        // Check if multi-line block (if, for, while, heredoc)
        if(/^cat\s+<<\s*['"]?([A-Za-z0-9_]+)['"]?\s*>\s*(\S+)/.test(l)){
          const m = l.match(/^cat\s+<<\s*['"]?([A-Za-z0-9_]+)['"]?\s*>\s*(\S+)/);
          const eof = m[1], dest = m[2];
          const bLines = [];
          li++;
          while(li < rawLines.length && rawLines[li].trim() !== eof){
            bLines.push(rawLines[li]);
            li++;
          }
          execHeredoc(dest, bLines.join('\n') + '\n', out);
          continue;
        }

        // Compound shell construct: if ... fi
        if(/^if\s+.+\s+fi$/.test(l) || l.startsWith('if ')){
          const mTest = l.match(/^if\s+\[\s*([^\]]+)\s*\];?\s*then\s+(.*?)(?:;?\s*else\s+(.*?))?;?\s*fi$/);
          if(mTest){
            const testCond = mTest[1].trim();
            const thenPart = mTest[2].trim();
            const elsePart = mTest[3] ? mTest[3].trim() : '';
            let condPassed = false;
            if(testCond.startsWith('-f ')){
              const fPath = normalize(testCond.slice(3).trim());
              const r = resolve(fPath, true);
              condPassed = !!(r && r.node.type === 'file');
            } else if(testCond.startsWith('-d ')){
              const dPath = normalize(testCond.slice(3).trim());
              const r = resolve(dPath, true);
              condPassed = !!(r && r.node.type === 'dir');
            }
            if(condPassed && thenPart){
              dispatchCommand(thenPart, out);
            } else if(!condPassed && elsePart){
              dispatchCommand(elsePart, out);
            }
            lastExitCode = 0;
            continue;
          }
        }

        // Compound shell construct: for ... in ...; do ... done
        if(l.startsWith('for ') && l.includes('; do ') && l.endsWith('; done')){
          const mFor = l.match(/^for\s+([A-Za-z0-9_]+)\s+in\s+(.*?);\s*do\s+(.*?);\s*done$/);
          if(mFor){
            const varName = mFor[1];
            const items = mFor[2].trim().split(/\s+/).filter(Boolean);
            const body = mFor[3].trim();
            for(const it of items){
              const cmdSub = body.split('$' + varName).join(it);
              const cmds = splitChains(cmdSub);
              for(const c of cmds){
                if(c.type === 'and' && lastExitCode !== 0) break;
                if(c.type === 'or' && lastExitCode === 0) break;
                execSingle(c.cmd, out);
              }
            }
            continue;
          }
        }

        // Compound shell construct: while read ... < file | pipe
        if(l.startsWith('while read ') && l.includes('; do ') && l.includes('; done')){
          const mWhile = l.match(/^while\s+read\s+([A-Za-z0-9_]+);?\s*do\s+(.*?);?\s*done\s*<\s*(\S+)(?:\s*\|\s*(.*))?$/);
          if(mWhile){
            const varName = mWhile[1];
            const body = mWhile[2].trim();
            const srcFile = mWhile[3].trim();
            const pipeCmd = mWhile[4] ? mWhile[4].trim() : '';
            const abs = normalize(srcFile);
            const res = resolve(abs, true);
            if(res && res.node.content){
              const fLines = res.node.content.split('\n').filter(Boolean);
              let capLines = [];
              for(const fl of fLines){
                const cmdSub = body.split('$' + varName).join(fl);
                const subOut = {
                  say: (t) => capLines.push(String(t)),
                  ok: (t) => capLines.push(String(t)),
                  err: (t) => out.err(String(t)),
                  dim: () => {}
                };
                dispatchCommand(cmdSub, subOut);
              }
              if(pipeCmd){
                dispatchPipeStage(pipeCmd, capLines, out);
              } else {
                capLines.forEach(cl => out.say(cl));
              }
            }
            continue;
          }
        }

        // Support chained commands: &&, ||, ;
        const cmds = splitChains(l);
        for(const c of cmds){
          if(c.type === 'and' && lastExitCode !== 0) break;
          if(c.type === 'or' && lastExitCode === 0) break;
          execSingle(c.cmd, out);
        }
      }

      return {
        lines,
        prompt: this.prompt(),
        state: this.state()
      };
    }
  };

  function splitChains(line){
    const list = [];
    const re = /(&&|\|\||;)/g;
    let last = 0, m, lastType = 'seq';
    while((m = re.exec(line)) !== null){
      const seg = line.slice(last, m.index).trim();
      if(seg) list.push({ cmd: seg, type: lastType });
      lastType = m[1] === '&&' ? 'and' : m[1] === '||' ? 'or' : 'seq';
      last = m.index + m[1].length;
    }
    const tail = line.slice(last).trim();
    if(tail) list.push({ cmd: tail, type: lastType });
    return list;
  }

  function execHeredoc(destPath, content, out){
    const abs = normalize(destPath);
    const slash = abs.lastIndexOf('/');
    const parPath = abs.slice(0, slash) || '/';
    const fname = abs.slice(slash + 1);
    const par = resolve(parPath, true);
    if(!par || par.node.type !== 'dir'){
      out.err(`bash: ${destPath}: No such file or directory`);
      lastExitCode = 1;
      return;
    }
    par.node.entries[fname] = {
      type: 'file', inode: Math.floor(Math.random()*10000)+500,
      owner: user, group: user === 'root' ? 'root' : 'oinstall',
      mode: 0o666 & ~umask, mtime: 'Oct 29 10:00',
      content, size: content.length
    };
    lastExitCode = 0;
  }

  function execSingle(cmdLine, out){
    let c = cmdLine.trim();
    if(!c) return;

    // Check pipeline |
    // If command contains pipe and not inside quotes
    if(c.includes('|') && !/['"][^'"]*\|[^'"]*['"]/.test(c)){
      execPipe(c, out);
      return;
    }

    // Check redirection >, >>, 2>, 2>&1
    let redirOut = null, append = false, redirErr = null, errToOut = false;
    if(c.includes('2>&1')){
      errToOut = true;
      c = c.replace('2>&1', '').trim();
    }
    if(c.includes('2>')){
      const m = c.match(/2>\s*(\S+)/);
      if(m){ redirErr = m[1]; c = c.replace(/2>\s*\S+/, '').trim(); }
    }
    if(c.includes('>>')){
      const m = c.match(/>>\s*(\S+)/);
      if(m){ redirOut = m[1]; append = true; c = c.replace(/>>\s*\S+/, '').trim(); }
    } else if(c.includes('>')){
      const m = c.match(/>\s*(\S+)/);
      if(m){ redirOut = m[1]; append = false; c = c.replace(/>\s*\S+/, '').trim(); }
    }

    const capture = [];
    const capOut = {
      say: (t) => capture.push({ k: 'out', t: String(t) }),
      ok:  (t) => capture.push({ k: 'ok',  t: String(t) }),
      err: (t) => capture.push({ k: 'err', t: String(t) }),
      dim: (t) => capture.push({ k: 'dim', t: String(t) })
    };

    dispatchCommand(c, capOut);

    if(redirOut){
      const outText = capture.filter(x => x.k === 'out' || x.k === 'ok' || (errToOut && x.k === 'err')).map(x => x.t).join('\n') + (capture.length ? '\n' : '');
      if(redirOut !== '/dev/null'){
        writeRedir(redirOut, outText, append, out);
      }
      if(redirErr && redirErr !== '/dev/null'){
        const errText = capture.filter(x => x.k === 'err').map(x => x.t).join('\n') + '\n';
        writeRedir(redirErr, errText, false, out);
      }
      // Print any non-redirected errors
      if(!errToOut && !redirErr){
        capture.filter(x => x.k === 'err').forEach(x => out.err(x.t));
      }
    } else {
      capture.forEach(x => {
        if(x.k === 'err') out.err(x.t);
        else if(x.k === 'ok') out.ok(x.t);
        else if(x.k === 'dim') out.dim(x.t);
        else out.say(x.t);
      });
    }
  }

  function writeRedir(destPath, text, isAppend, out){
    const abs = normalize(destPath);
    const slash = abs.lastIndexOf('/');
    const parPath = abs.slice(0, slash) || '/';
    const fname = abs.slice(slash + 1);
    const par = resolve(parPath, true);
    if(!par || par.node.type !== 'dir'){
      out.err(`bash: ${destPath}: No such file or directory`);
      lastExitCode = 1;
      return;
    }
    const existing = par.node.entries[fname];
    if(existing && existing.type === 'file'){
      existing.content = isAppend ? existing.content + text : text;
      existing.size = existing.content.length;
      existing.mtime = 'Oct 29 10:00';
    } else {
      par.node.entries[fname] = {
        type: 'file', inode: Math.floor(Math.random()*10000)+500,
        owner: user, group: user === 'root' ? 'root' : 'oinstall',
        mode: 0o666 & ~umask, mtime: 'Oct 29 10:00',
        content: text, size: text.length
      };
    }
  }

  function execPipe(pipeline, out){
    const stages = pipeline.split('|').map(s => s.trim()).filter(Boolean);
    let curInput = [];
    for(let i = 0; i < stages.length; i++){
      const stg = stages[i];
      const capture = [];
      const capOut = {
        say: (t) => capture.push(String(t)),
        ok:  (t) => capture.push(String(t)),
        err: (t) => out.err(String(t)),
        dim: (t) => {}
      };
      dispatchPipeStage(stg, curInput, capOut);
      curInput = capture;
      if(lastExitCode !== 0 && i < stages.length - 1) break;
    }
    curInput.forEach(l => out.say(l));
  }

  function parseArgs(str){
    const args = [];
    const re = /(?:[^\s"']+|"[^"]*"|'[^']*')+/g;
    let m;
    while((m = re.exec(str)) !== null){
      let val = m[0];
      const isSingle = val.startsWith("'") && val.endsWith("'");
      if((val.startsWith('"') && val.endsWith('"')) || isSingle){
        val = val.slice(1, -1);
      }
      if(!isSingle){
        val = val.replace(/\$([A-Za-z0-9_?]+)/g, (_, name) => {
          if(name === '?') return String(lastExitCode);
          return env[name] != null ? env[name] : '';
        });
      }
      args.push(val);
    }
    return expandGlobs(args);
  }

  function expandGlobs(args){
    const out = [];
    for(const arg of args){
      if(arg.includes('*')){
        // Expand glob
        const slash = arg.lastIndexOf('/');
        const dirPath = slash !== -1 ? arg.slice(0, slash) || '/' : cwd;
        const pattern = slash !== -1 ? arg.slice(slash + 1) : arg;
        const res = resolve(dirPath, true);
        if(res && res.node.type === 'dir'){
          const pRegex = new RegExp('^' + pattern.split('.').join('\\.').split('*').join('.*') + '$');
          const matches = Object.keys(res.node.entries).filter(k => pRegex.test(k)).sort();
          if(matches.length){
            matches.forEach(m => {
              const prefix = slash !== -1 ? (dirPath === '/' ? '/' : dirPath + '/') : '';
              out.push(prefix + m);
            });
            continue;
          }
        }
      }
      out.push(arg);
    }
    return out;
  }

  function dispatchPipeStage(cmdStr, stdinLines, out){
    const args = parseArgs(cmdStr);
    if(!args.length) return;
    const name = args[0];

    if(name === 'grep' || name === 'egrep'){
      handleGrepPipe(args.slice(1), stdinLines, out);
    } else if(name === 'sort'){
      handleSortPipe(args.slice(1), stdinLines, out);
    } else if(name === 'uniq'){
      handleUniqPipe(args.slice(1), stdinLines, out);
    } else if(name === 'cut'){
      handleCutPipe(args.slice(1), stdinLines, out);
    } else if(name === 'awk'){
      handleAwkPipe(args.slice(1), stdinLines, out);
    } else if(name === 'sed'){
      handleSedPipe(args.slice(1), stdinLines, out);
    } else if(name === 'head'){
      handleHeadPipe(args.slice(1), stdinLines, out);
    } else if(name === 'tail'){
      handleTailPipe(args.slice(1), stdinLines, out);
    } else if(name === 'wc'){
      handleWcPipe(args.slice(1), stdinLines, out);
    } else if(name === 'tr'){
      handleTrPipe(args.slice(1), stdinLines, out);
    } else if(name === 'tee'){
      const append = args.includes('-a');
      const files = args.filter(a => !a.startsWith('-'));
      stdinLines.forEach(l => {
        out.say(l);
        files.forEach(f => writeRedir(f, l + '\n', append, out));
      });
    } else if(name === 'xargs'){
      const sub = args.slice(1).join(' ') || 'echo';
      const items = stdinLines.join(' ').split(/\s+/).filter(Boolean);
      dispatchCommand(sub + ' ' + items.join(' '), out);
    } else {
      // General command
      dispatchCommand(cmdStr, out);
    }
  }

  function dispatchCommand(cmdStr, out){
    const args = parseArgs(cmdStr);
    if(!args.length) return;
    let name = args[0];

    // sudo handling
    if(name === 'sudo'){
      if(args[1] === '-i' || (args[1] === 'su' && args[2] === '-')){
        user = 'root';
        env.USER = 'root';
        env.HOME = '/root';
        cwd = '/root';
        lastExitCode = 0;
        return;
      }
      if(args[1] === '-l'){
        out.say('Matching Defaults entries for oracle on prod-db01:');
        out.say('    !visiblepw, always_set_home, match_group_by_gid, env_reset');
        out.say('User oracle may run the following commands on prod-db01:');
        out.say('    (ALL : ALL) ALL');
        lastExitCode = 0;
        return;
      }
      // sudo <cmd> -> execute as root
      const prevUser = user;
      user = 'root';
      const subArgs = args.slice(1);
      if(subArgs.length){
        dispatchCommand(subArgs.join(' '), out);
      }
      user = prevUser;
      return;
    }

    if(name === 'su' && args[1] === '-'){
      user = 'root';
      env.USER = 'root';
      env.HOME = '/root';
      cwd = '/root';
      lastExitCode = 0;
      return;
    }

    // Built-in Linux commands
    switch(name){
      case 'pwd':
        out.say(cwd);
        lastExitCode = 0;
        return;

      case 'cd':
        handleCd(args[1], out);
        return;

      case 'ls':
        handleLs(args.slice(1), out);
        return;

      case 'mkdir':
        handleMkdir(args.slice(1), out);
        return;

      case 'touch':
        handleTouch(args.slice(1), out);
        return;

      case 'rm':
        handleRm(args.slice(1), out);
        return;

      case 'cp':
        handleCp(args.slice(1), out);
        return;

      case 'mv':
        handleMv(args.slice(1), out);
        return;

      case 'cat':
        handleCat(args.slice(1), out);
        return;

      case 'less':
      case 'more':
        handleLess(args.slice(1), out);
        return;

      case 'head':
        handleHead(args.slice(1), out);
        return;

      case 'tail':
        handleTail(args.slice(1), out);
        return;

      case 'wc':
        handleWc(args.slice(1), out);
        return;

      case 'find':
        handleFind(args.slice(1), out);
        return;

      case 'which':
      case 'whereis':
        handleWhich(args.slice(1), out);
        return;

      case 'ln':
        handleLn(args.slice(1), out);
        return;

      case 'chmod':
        handleChmod(args.slice(1), out);
        return;

      case 'chown':
        handleChown(args.slice(1), out);
        return;

      case 'umask':
        if(!args[1]){ out.say('0' + umask.toString(8).padStart(3,'0')); }
        else { umask = parseInt(args[1], 8) || 0o022; }
        lastExitCode = 0;
        return;

      case 'whoami':
        out.say(user);
        lastExitCode = 0;
        return;

      case 'id':
        handleId(args[1], out);
        return;

      case 'useradd':
        handleUseradd(args.slice(1), out);
        return;

      case 'usermod':
        handleUsermod(args.slice(1), out);
        return;

      case 'ps':
        handlePs(args.slice(1), out);
        return;

      case 'pgrep':
        handlePgrep(args.slice(1), out);
        return;

      case 'kill':
      case 'pkill':
        handleKill(args.slice(1), name === 'pkill', out);
        return;

      case 'top':
      case 'htop':
        handleTop(out);
        return;

      case 'free':
        handleFree(args.slice(1), out);
        return;

      case 'uptime':
        out.say(' 10:15:22 up 14 days,  3:40,  2 users,  load average: 0.28, 0.42, 0.35');
        lastExitCode = 0;
        return;

      case 'systemctl':
        handleSystemctl(args.slice(1), out);
        return;

      case 'journalctl':
        handleJournalctl(args.slice(1), out);
        return;

      case 'dmesg':
        out.say('[    0.000000] Linux version 5.15.0-88-generic (buildd@lcy02-amd64) #98-Ubuntu SMP');
        out.say('[    1.240120] Freeing unused kernel image (initmem) memory: 2452K');
        out.say('[    2.890110] e1000e: Intel(R) PRO/1000 Network Driver');
        out.say('[ 4521.120000] e1000e 0000:00:1f.6 eth0: NIC Link is Up 1000 Mbps Full Duplex');
        lastExitCode = 0;
        return;

      case 'df':
        handleDf(args.slice(1), out);
        return;

      case 'du':
        handleDu(args.slice(1), out);
        return;

      case 'lsblk':
        out.say('NAME        MAJ:MIN RM  SIZE RO TYPE MOUNTPOINTS');
        out.say('sda           8:0    0  100G  0 disk ');
        out.say('├─sda1        8:1    0    1G  0 part /boot');
        out.say('├─sda2        8:2    0   40G  0 part /');
        out.say('├─sda3        8:3    0   20G  0 part /var/log');
        out.say('└─sda4        8:4    0   35G  0 part /u01');
        out.say('sdb           8:16   0  500G  0 disk ');
        out.say('└─sdb1        8:17   0  500G  0 part /data');
        lastExitCode = 0;
        return;

      case 'tar':
        handleTar(args.slice(1), out);
        return;

      case 'gzip':
      case 'gunzip':
        handleGzip(args.slice(1), name === 'gunzip', out);
        return;

      case 'rsync':
        handleRsync(args.slice(1), out);
        return;

      case 'ip':
        handleIp(args.slice(1), out);
        return;

      case 'ifconfig':
        handleIp(['a'], out);
        return;

      case 'ping':
        handlePing(args.slice(1), out);
        return;

      case 'ss':
      case 'netstat':
        handleSs(args.slice(1), out);
        return;

      case 'lsof':
        handleLsof(args.slice(1), out);
        return;

      case 'curl':
        handleCurl(args.slice(1), out);
        return;

      case 'dig':
      case 'nslookup':
        handleDns(args.slice(1), out);
        return;

      case 'ssh':
        handleSsh(args.slice(1), out);
        return;

      case 'ssh-keygen':
        out.say('Generating public/private ed25519 key pair.');
        out.say('Your identification has been saved in /home/oracle/.ssh/id_ed25519');
        out.say('Your public key has been saved in /home/oracle/.ssh/id_ed25519.pub');
        out.say('The key fingerprint is:');
        out.say('SHA256:7mPqQ8xJvB2l4Nw8fK1s9XtZaBcDeFgHiJkLmNoPqRs oracle@prod-db01');
        lastExitCode = 0;
        return;

      case 'crontab':
        handleCrontab(args.slice(1), out);
        return;

      case 'export':
        handleExport(args.slice(1), out);
        return;

      case 'env':
      case 'printenv':
        for(const k of Object.keys(env).sort()) out.say(`${k}=${env[k]}`);
        lastExitCode = 0;
        return;

      case 'ulimit':
        handleUlimit(args.slice(1), out);
        return;

      case 'sysctl':
        handleSysctl(args.slice(1), out);
        return;

      case 'grep':
      case 'egrep':
        handleGrep(args.slice(1), out);
        return;

      case 'sort':
        handleSort(args.slice(1), out);
        return;

      case 'uniq':
        handleUniq(args.slice(1), out);
        return;

      case 'cut':
        handleCut(args.slice(1), out);
        return;

      case 'awk':
        handleAwk(args.slice(1), out);
        return;

      case 'sed':
        handleSed(args.slice(1), out);
        return;

      case 'echo':
        out.say(args.slice(1).join(' '));
        lastExitCode = 0;
        return;

      case 'date':
        out.say('Thu Oct 29 10:15:22 UTC 2026');
        lastExitCode = 0;
        return;

      case 'mount':
        if(args.includes('-a')){
          // mount -a
          lastExitCode = 0;
        } else {
          out.say('/dev/sda2 on / type ext4 (rw,relatime)');
          out.say('/dev/sda3 on /var/log type ext4 (rw,relatime)');
          out.say('/dev/sdb1 on /u01 type ext4 (rw,relatime)');
          lastExitCode = 0;
        }
        return;

      case 'umount':
        lastExitCode = 0;
        return;

      case 'vmstat':
        out.say('procs -----------memory---------- ---swap-- -----io---- -system-- ------cpu-----');
        out.say(' r  b   swpd   free   buff  cache   si   so    bi    bo   in   cs us sy id wa st');
        out.say(' 0  0      0 4718592 262144 7444889    0    0     4    12   50   80  4  2 94  0  0');
        out.say(' 0  0      0 4718592 262144 7444889    0    0     0     0  210  420  2  1 97  0  0');
        lastExitCode = 0;
        return;

      case 'jobs':
        out.say('[1]+  Running                 ./scripts/backup_db.sh &');
        lastExitCode = 0;
        return;

      case 'dpkg':
        if(args.includes('-l')){
          out.say('Desired=Unknown/Install/Remove/Purge/Hold');
          out.say('| Status=Not/Inst/Conf-files/Unpacked/halF-conf/Half-inst/trig-aWait/Trig-pend');
          out.say('+++-==============================-================-============-============================================');
          out.say('ii  nginx                          1.24.0-1ubuntu1  amd64        small, powerful, scalable web server');
          out.say('ii  openssh-server                 8.9p1-3ubuntu0.4 amd64        secure shell (SSH) server');
          out.say('ii  curl                           7.81.0-1ubuntu1  amd64        command line tool for transferring data');
        }
        lastExitCode = 0;
        return;

      case 'uname':
        if(args.includes('-a')) out.say('Linux prod-db01 5.15.0-88-generic #98-Ubuntu SMP Mon Oct 2 15:18:56 UTC 2026 x86_64 x86_64 x86_64 GNU/Linux');
        else if(args.includes('-r')) out.say('5.15.0-88-generic');
        else out.say('Linux');
        lastExitCode = 0;
        return;

      case 'hostname':
        if(args.includes('-I')) out.say('10.0.1.10 127.0.0.1');
        else out.say('prod-db01');
        lastExitCode = 0;
        return;

      case 'source':
      case '.':
        out.say('-- Sourced ' + (args[1] || 'profile'));
        lastExitCode = 0;
        return;

      case 'vim':
      case 'vi':
      case 'nano':
        out.say(`[${name}] File "${args[1]||'new'}" opens in editor mode.`);
        out.dim(`(Playground tip: Server par vi use hota hai. Yahan playground console mein command se file badal sakte ho jaise: sed -i, echo >> file, ya cat << 'EOF' > file)`);
        lastExitCode = 0;
        return;

      case 'apt':
      case 'apt-get':
      case 'dnf':
      case 'yum':
        handlePkg(name, args.slice(1), out);
        return;

      case 'ufw':
      case 'firewall-cmd':
        handleFw(name, args.slice(1), out);
        return;

      default:
        // Check if script in current path or ./script.sh
        if(name.startsWith('./') || name.startsWith('/')){
          const abs = normalize(name);
          const res = resolve(abs, true);
          if(!res){
            out.err(`bash: ${name}: No such file or directory`);
            lastExitCode = 127;
            return;
          }
          if((res.node.mode & 0o111) === 0){
            out.err(`bash: ${name}: Permission denied`);
            lastExitCode = 126;
            return;
          }
          // Script execution simulation
          out.say(`Running ${name}...`);
          const body = res.node.content.split('\n').filter(l => l.trim() && !l.startsWith('#!'));
          body.forEach(l => out.say(l));
          lastExitCode = 0;
          return;
        }
        out.err(`bash: ${name}: command not found`);
        lastExitCode = 127;
        return;
    }
  }

  /* Command Handlers */
  function handleCd(target, out){
    if(!target || target === '~'){
      cwd = user === 'root' ? '/root' : '/home/' + user;
      lastExitCode = 0;
      return;
    }
    if(target === '-'){
      // toggle
      out.say(cwd);
      lastExitCode = 0;
      return;
    }
    const abs = normalize(target);
    const res = resolve(abs, true);
    if(!res){
      out.err(`bash: cd: ${target}: No such file or directory`);
      lastExitCode = 1;
      return;
    }
    if(res.node.type !== 'dir'){
      out.err(`bash: cd: ${target}: Not a directory`);
      lastExitCode = 1;
      return;
    }
    // Check permission to cd (requires execute 'x' on dir)
    if(user !== 'root' && user !== res.node.owner && (res.node.mode & 0o001) === 0){
      out.err(`bash: cd: ${target}: Permission denied`);
      lastExitCode = 1;
      return;
    }
    cwd = abs;
    lastExitCode = 0;
  }

  function handleLs(args, out){
    let showAll = false, showLong = false, human = false, timeSort = false, reverse = false, inode = false, dirOnly = false;
    const paths = [];
    args.forEach(a => {
      if(a.startsWith('-') && a.length > 1){
        if(a.includes('a')) showAll = true;
        if(a.includes('l')) showLong = true;
        if(a.includes('h')) human = true;
        if(a.includes('t')) timeSort = true;
        if(a.includes('r')) reverse = true;
        if(a.includes('i')) inode = true; if(a.includes('d')) dirOnly = true;
      } else {
        paths.push(a);
      }
    });
    if(!paths.length) paths.push('.');

    paths.forEach(p => {
      const abs = normalize(p);
      const res = resolve(abs, true);
      if(!res){
        out.err(`ls: cannot access '${p}': No such file or directory`);
        lastExitCode = 2;
        return;
      }
      if(res.node.type !== 'dir' || dirOnly){
        // single file
        printLsEntry(res.name || p, res.node, showLong, human, inode, out);
        lastExitCode = 0;
        return;
      }
      let entries = Object.keys(res.node.entries);
      if(!showAll) entries = entries.filter(e => !e.startsWith('.'));
      else {
        // include . and ..
        entries = ['.', '..'].concat(entries);
      }

      entries.sort();
      if(reverse) entries.reverse();

      if(showLong){
        out.say(`total ${entries.length * 4}`);
        entries.forEach(name => {
          let node = name === '.' ? res.node : name === '..' ? (res.parent || res.node) : res.node.entries[name];
          printLsEntry(name, node, true, human, inode, out);
        });
      } else {
        // Multi-column or spaced output
        out.say(entries.join('  '));
      }
      lastExitCode = 0;
    });
  }

  function printLsEntry(name, n, isLong, human, showInode, out){
    if(!isLong){
      out.say(name);
      return;
    }
    const perm = formatPerm(n.mode, n.type === 'dir', n.type === 'link');
    const links = n.type === 'dir' ? 2 : 1;
    const sz = n.type === 'dir' ? (human ? '4.0K' : '4096') : (human ? formatSize(n.size) : String(n.size||0));
    const ino = showInode ? `${n.inode} ` : '';
    const linkExtra = n.type === 'link' ? ` -> ${n.target}` : '';
    out.say(`${ino}${perm} ${links} ${n.owner} ${n.group} ${sz.padStart(6,' ')} ${n.mtime} ${name}${linkExtra}`);
  }

  function handleMkdir(args, out){
    let makeParents = args.includes('-p');
    const dirs = args.filter(a => !a.startsWith('-'));
    if(!dirs.length){
      out.err('mkdir: missing operand');
      lastExitCode = 1;
      return;
    }
    dirs.forEach(d => {
      const abs = normalize(d);
      const parts = abs.split('/').filter(Boolean);
      let cur = root;
      for(let i = 0; i < parts.length; i++){
        const name = parts[i];
        if(!cur.entries[name]){
          if(!makeParents && i < parts.length - 1){
            out.err(`mkdir: cannot create directory '${d}': No such file or directory`);
            lastExitCode = 1;
            return;
          }
          cur.entries[name] = {
            type: 'dir', inode: Math.floor(Math.random()*10000)+100,
            owner: user, group: user === 'root' ? 'root' : 'oinstall',
            mode: 0o777 & ~umask, mtime: 'Oct 29 10:15', entries: {}
          };
        }
        cur = cur.entries[name];
      }
      lastExitCode = 0;
    });
  }

  function handleTouch(args, out){
    const files = args.filter(a => !a.startsWith('-'));
    files.forEach(f => {
      const abs = normalize(f);
      const slash = abs.lastIndexOf('/');
      const parPath = abs.slice(0, slash) || '/';
      const fname = abs.slice(slash + 1);
      const par = resolve(parPath, true);
      if(!par || par.node.type !== 'dir'){
        out.err(`touch: cannot touch '${f}': No such file or directory`);
        lastExitCode = 1;
        return;
      }
      if(par.node.entries[fname]){
        par.node.entries[fname].mtime = 'Oct 29 10:15';
      } else {
        par.node.entries[fname] = {
          type: 'file', inode: Math.floor(Math.random()*10000)+100,
          owner: user, group: user === 'root' ? 'root' : 'oinstall',
          mode: 0o666 & ~umask, mtime: 'Oct 29 10:15', content: '', size: 0
        };
      }
      lastExitCode = 0;
    });
  }

  function handleRm(args, out){
    let recur = args.some(a => a.startsWith('-') && a.includes('r'));
    let force = args.some(a => a.startsWith('-') && a.includes('f'));
    const targets = args.filter(a => !a.startsWith('-'));
    targets.forEach(t => {
      const abs = normalize(t);
      if(abs === '/'){
        out.err('rm: it is dangerous to operate recursively on "/" (fail-safe protected)');
        lastExitCode = 1;
        return;
      }
      const slash = abs.lastIndexOf('/');
      const parPath = abs.slice(0, slash) || '/';
      const fname = abs.slice(slash + 1);
      const par = resolve(parPath, true);
      if(!par || !par.node.entries || !par.node.entries[fname]){
        if(!force){
          out.err(`rm: cannot remove '${t}': No such file or directory`);
          lastExitCode = 1;
        }
        return;
      }
      const targetNode = par.node.entries[fname];
      if(targetNode.type === 'dir' && !recur){
        out.err(`rm: cannot remove '${t}': Is a directory`);
        lastExitCode = 1;
        return;
      }
      delete par.node.entries[fname];
      lastExitCode = 0;
    });
  }

  function handleCp(args, out){
    let recur = args.some(a => a.startsWith('-') && (a.includes('r') || a.includes('R') || a.includes('a')));
    const files = args.filter(a => !a.startsWith('-'));
    if(files.length < 2){
      out.err('cp: missing file operand');
      lastExitCode = 1;
      return;
    }
    const src = normalize(files[0]);
    const dest = normalize(files[1]);
    const srcRes = resolve(src, true);
    if(!srcRes){
      out.err(`cp: cannot stat '${files[0]}': No such file or directory`);
      lastExitCode = 1;
      return;
    }
    if(srcRes.node.type === 'dir' && !recur){
      out.err(`cp: -r not specified; omitting directory '${files[0]}'`);
      lastExitCode = 1;
      return;
    }

    let destRes = resolve(dest, true);
    if(destRes && destRes.node.type === 'dir'){
      // copy inside directory
      const fname = srcRes.name;
      destRes.node.entries[fname] = cloneDeep(srcRes.node);
      destRes.node.entries[fname].inode = Math.floor(Math.random()*10000)+100;
    } else {
      const slash = dest.lastIndexOf('/');
      const parPath = dest.slice(0, slash) || '/';
      const fname = dest.slice(slash + 1);
      const par = resolve(parPath, true);
      if(!par || par.node.type !== 'dir'){
        out.err(`cp: cannot create regular file '${files[1]}': No such file or directory`);
        lastExitCode = 1;
        return;
      }
      par.node.entries[fname] = cloneDeep(srcRes.node);
      par.node.entries[fname].inode = Math.floor(Math.random()*10000)+100;
    }
    lastExitCode = 0;
  }

  function handleMv(args, out){
    const files = args.filter(a => !a.startsWith('-'));
    if(files.length < 2){
      out.err('mv: missing file operand');
      lastExitCode = 1;
      return;
    }
    const src = normalize(files[0]);
    const dest = normalize(files[1]);
    const srcRes = resolve(src, false);
    if(!srcRes){
      out.err(`mv: cannot stat '${files[0]}': No such file or directory`);
      lastExitCode = 1;
      return;
    }

    let destRes = resolve(dest, true);
    if(destRes && destRes.node.type === 'dir'){
      destRes.node.entries[srcRes.name] = srcRes.node;
      delete srcRes.parent.entries[srcRes.name];
    } else {
      const slash = dest.lastIndexOf('/');
      const parPath = dest.slice(0, slash) || '/';
      const fname = dest.slice(slash + 1);
      const par = resolve(parPath, true);
      if(!par || par.node.type !== 'dir'){
        out.err(`mv: cannot move '${files[0]}' to '${files[1]}': No such file or directory`);
        lastExitCode = 1;
        return;
      }
      par.node.entries[fname] = srcRes.node;
      delete srcRes.parent.entries[srcRes.name];
    }
    lastExitCode = 0;
  }

  function handleCat(args, out){
    let num = args.includes('-n');
    const files = args.filter(a => !a.startsWith('-'));
    if(!files.length){ lastExitCode = 0; return; }
    files.forEach(f => {
      const abs = normalize(f);
      const res = resolve(abs, true);
      if(!res){
        out.err(`cat: ${f}: No such file or directory`);
        lastExitCode = 1;
        return;
      }
      if(res.node.type === 'dir'){
        out.err(`cat: ${f}: Is a directory`);
        lastExitCode = 1;
        return;
      }
      const ls = res.node.content.split('\n');
      if(ls[ls.length - 1] === '') ls.pop();
      ls.forEach((l, i) => {
        out.say(num ? `${String(i+1).padStart(6,' ')}  ${l}` : l);
      });
      lastExitCode = 0;
    });
  }

  function handleLess(args, out){
    const f = args.find(a => !a.startsWith('-'));
    if(!f){ lastExitCode = 0; return; }
    handleHead(['-n', '25', f], out);
    out.dim(`(END · press 'q' to quit in standard terminal)`);
  }

  function handleHead(args, out){
    let n = 10;
    const paths = [];
    for(let i = 0; i < args.length; i++){
      if(args[i] === '-n' && args[i+1]){ n = parseInt(args[++i], 10) || 10; }
      else if(/^-\d+$/.test(args[i])){ n = parseInt(args[i].slice(1), 10); }
      else paths.push(args[i]);
    }
    paths.forEach(f => {
      const abs = normalize(f);
      const res = resolve(abs, true);
      if(!res || res.node.type !== 'file'){
        out.err(`head: cannot open '${f}' for reading: No such file or directory`);
        lastExitCode = 1;
        return;
      }
      const ls = res.node.content.split('\n');
      if(ls[ls.length - 1] === '') ls.pop();
      ls.slice(0, n).forEach(l => out.say(l));
      lastExitCode = 0;
    });
  }

  function handleTail(args, out){
    let n = 10, follow = false;
    const paths = [];
    for(let i = 0; i < args.length; i++){
      if(args[i] === '-n' && args[i+1]){ n = parseInt(args[++i], 10) || 10; }
      else if(/^-\d+$/.test(args[i])){ n = parseInt(args[i].slice(1), 10); }
      else if(args[i] === '-f'){ follow = true; }
      else paths.push(args[i]);
    }
    paths.forEach(f => {
      const abs = normalize(f);
      const res = resolve(abs, true);
      if(!res || res.node.type !== 'file'){
        out.err(`tail: cannot open '${f}' for reading: No such file or directory`);
        lastExitCode = 1;
        return;
      }
      const ls = res.node.content.split('\n');
      if(ls[ls.length - 1] === '') ls.pop();
      ls.slice(Math.max(0, ls.length - n)).forEach(l => out.say(l));
      if(follow){
        out.dim(`-- Following ${f} (real-time stream simulation) · Ctrl+C to stop`);
      }
      lastExitCode = 0;
    });
  }

  function handleWc(args, out){
    let lineOnly = args.includes('-l');
    let wordOnly = args.includes('-w');
    const paths = args.filter(a => !a.startsWith('-'));
    paths.forEach(f => {
      const abs = normalize(f);
      const res = resolve(abs, true);
      if(!res || res.node.type !== 'file'){
        out.err(`wc: ${f}: No such file or directory`);
        lastExitCode = 1;
        return;
      }
      const ls = res.node.content.split('\n');
      if(ls[ls.length - 1] === '') ls.pop();
      const lines = ls.length;
      const words = res.node.content.trim().split(/\s+/).filter(Boolean).length;
      const bytes = res.node.content.length;
      if(lineOnly) out.say(`${lines} ${f}`);
      else if(wordOnly) out.say(`${words} ${f}`);
      else out.say(`${lines} ${words} ${bytes} ${f}`);
      lastExitCode = 0;
    });
  }

  function handleFind(args, out){
    const pathArg = (args[0] && !args[0].startsWith('-')) ? args[0] : '.';
    let namePattern = null;
    let typeFilter = null; // 'f', 'd', 'l'
    let sizeFilter = null; // '+100M', '-10k'
    let mtimeFilter = null; // '+7', '-1'
    let permFilter = null;
    let doDelete = args.includes('-delete');
    let execCmd = null;

    for(let i = 0; i < args.length; i++){
      if((args[i] === '-name' || args[i] === '-iname') && args[i+1]){
        namePattern = new RegExp('^' + args[++i].replace(/\./g, '\\.').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i');
      } else if(args[i] === '-type' && args[i+1]){
        typeFilter = args[++i];
      } else if(args[i] === '-size' && args[i+1]){
        sizeFilter = args[++i];
      } else if(args[i] === '-mtime' && args[i+1]){
        mtimeFilter = args[++i];
      } else if(args[i] === '-perm' && args[i+1]){
        permFilter = args[++i];
      } else if(args[i] === '-exec'){
        execCmd = args.slice(i+1, args.indexOf(';', i)).join(' ');
        break;
      }
    }

    const startAbs = normalize(pathArg);
    const startRes = resolve(startAbs, true);
    if(!startRes){
      out.err(`find: '${pathArg}': No such file or directory`);
      lastExitCode = 1;
      return;
    }

    const matches = [];
    function search(node, curPath){
      let ok = true;
      const fname = curPath.split('/').pop() || '/';

      if(namePattern && !namePattern.test(fname)) ok = false;
      if(typeFilter){
        const t = node.type === 'dir' ? 'd' : node.type === 'link' ? 'l' : 'f';
        if(t !== typeFilter) ok = false;
      }
      if(sizeFilter){
        const m = sizeFilter.match(/^([+-]?)(\d+)([KMGkmg]?)$/);
        if(m){
          const sign = m[1], num = +m[2], unit = m[3].toUpperCase();
          const mult = unit === 'G' ? 1024*1024*1024 : unit === 'M' ? 1024*1024 : unit === 'K' ? 1024 : 1;
          const bytes = num * mult;
          const sz = node.size || 0;
          if(sign === '+' && sz <= bytes) ok = false;
          if(sign === '-' && sz >= bytes) ok = false;
        }
      }
      if(mtimeFilter){
        // Simulate: files with 'old_' in name are > 7 days old
        const isOld = curPath.includes('old_') || curPath.includes('.tmp');
        if(mtimeFilter === '+7' && !isOld) ok = false;
      }
      if(permFilter){
        const modeOct = (node.mode || 0o644).toString(8);
        if(!modeOct.endsWith(permFilter.replace(/^0+/, ''))) ok = false;
      }

      if(ok) matches.push({ path: curPath, node });

      if(node.type === 'dir'){
        for(const child of Object.keys(node.entries).sort()){
          search(node.entries[child], curPath === '/' ? '/' + child : curPath + '/' + child);
        }
      }
    }

    search(startRes.node, pathArg === '.' ? '.' : startAbs);

    matches.forEach(m => {
      out.say(m.path);
      if(doDelete && m.node.type === 'file'){
        const slash = m.path.lastIndexOf('/');
        const parPath = normalize(m.path.slice(0, slash) || '/');
        const fname = m.path.slice(slash + 1);
        const par = resolve(parPath, true);
        if(par && par.node.entries) delete par.node.entries[fname];
      }
    });
    lastExitCode = 0;
  }

  function handleWhich(args, out){
    const cmd = args[0];
    if(!cmd){ lastExitCode = 1; return; }
    const sbin = ['nginx','sshd','iptables','ufw','useradd','usermod'];
    const std = ['ls','cd','pwd','cat','grep','awk','sed','systemctl','chmod','chown','top','free','df','tar','ssh','curl','python3','node','java','git','rsync','find','ps','kill','crontab','ip','ss','lsof','apt','dpkg'];
    if(sbin.includes(cmd)){
      out.say(`/usr/sbin/${cmd}`);
      lastExitCode = 0;
    } else if(std.includes(cmd)){
      out.say(`/usr/bin/${cmd}`);
      lastExitCode = 0;
    } else {
      out.err(`/usr/bin/which: no ${cmd} in (${env.PATH})`);
      lastExitCode = 1;
    }
  }

  function handleLn(args, out){
    const isSym = args.includes('-s') || args.includes('-sf') || args.includes('-sfn');
    const files = args.filter(a => !a.startsWith('-'));
    if(files.length < 2){
      out.err('ln: missing file operand');
      lastExitCode = 1;
      return;
    }
    const target = files[0];
    const linkPath = normalize(files[1]);
    const slash = linkPath.lastIndexOf('/');
    const parPath = linkPath.slice(0, slash) || '/';
    const linkName = linkPath.slice(slash + 1);
    const par = resolve(parPath, true);
    if(!par || par.node.type !== 'dir'){
      out.err(`ln: failed to create ${isSym?'symbolic ':''}link '${files[1]}': No such file or directory`);
      lastExitCode = 1;
      return;
    }
    par.node.entries[linkName] = {
      type: isSym ? 'link' : 'file',
      inode: Math.floor(Math.random()*10000)+100,
      owner: user, group: user === 'root' ? 'root' : 'oinstall',
      mode: isSym ? 0o777 : 0o644, mtime: 'Oct 29 10:15',
      target: isSym ? target : undefined,
      content: isSym ? undefined : ''
    };
    lastExitCode = 0;
  }

  function handleChmod(args, out){
    const recur = args.includes('-R');
    const rest = args.filter(a => a !== '-R');
    if(rest.length < 2){
      out.err('chmod: missing operand');
      lastExitCode = 1;
      return;
    }
    const modeArg = rest[0];
    const targets = rest.slice(1);

    targets.forEach(t => {
      const abs = normalize(t);
      const res = resolve(abs, true);
      if(!res){
        out.err(`chmod: cannot access '${t}': No such file or directory`);
        lastExitCode = 1;
        return;
      }
      applyChmod(res.node, modeArg);
      if(recur && res.node.type === 'dir'){
        function walk(d){
          for(const k of Object.keys(d.entries)){
            applyChmod(d.entries[k], modeArg);
            if(d.entries[k].type === 'dir') walk(d.entries[k]);
          }
        }
        walk(res.node);
      }
      lastExitCode = 0;
    });
  }

  function applyChmod(node, modeArg){
    if(/^\d{3,4}$/.test(modeArg)){
      node.mode = parseInt(modeArg, 8);
      return;
    }
    // Symbolic: +x, u+x, g-w, etc.
    let cur = node.mode || 0o644;
    if(modeArg === '+x' || modeArg === 'a+x') cur |= 0o111;
    else if(modeArg === 'u+x') cur |= 0o100;
    else if(modeArg === 'g+x') cur |= 0o010;
    else if(modeArg === 'o+x') cur |= 0o001;
    else if(modeArg === '-x') cur &= ~0o111;
    else if(modeArg === 'g-w') cur &= ~0o020;
    else if(modeArg === 'o-rwx' || modeArg === 'o=') cur &= ~0o007;
    node.mode = cur;
  }

  function handleChown(args, out){
    const recur = args.includes('-R');
    const rest = args.filter(a => a !== '-R');
    if(rest.length < 2){
      out.err('chown: missing operand');
      lastExitCode = 1;
      return;
    }
    const ownArg = rest[0];
    let newOwner = null, newGroup = null;
    if(ownArg.includes(':')){
      const p = ownArg.split(':');
      newOwner = p[0] || null;
      newGroup = p[1] || null;
    } else {
      newOwner = ownArg;
    }

    const targets = rest.slice(1);
    targets.forEach(t => {
      const abs = normalize(t);
      const res = resolve(abs, true);
      if(!res){
        out.err(`chown: cannot access '${t}': No such file or directory`);
        lastExitCode = 1;
        return;
      }
      if(newOwner) res.node.owner = newOwner;
      if(newGroup) res.node.group = newGroup;
      if(recur && res.node.type === 'dir'){
        function walk(d){
          for(const k of Object.keys(d.entries)){
            if(newOwner) d.entries[k].owner = newOwner;
            if(newGroup) d.entries[k].group = newGroup;
            if(d.entries[k].type === 'dir') walk(d.entries[k]);
          }
        }
        walk(res.node);
      }
      lastExitCode = 0;
    });
  }

  function handleId(targetUser, out){
    const u = targetUser || user;
    const info = users[u];
    if(!info){
      out.err(`id: '${u}': no such user`);
      lastExitCode = 1;
      return;
    }
    const grps = info.groups.map(g => `${groups[g]||1000}(${g})`).join(',');
    out.say(`uid=${info.uid}(${u}) gid=${info.gid}(${info.groups[0]||u}) groups=${grps}`);
    lastExitCode = 0;
  }

  function handleUseradd(args, out){
    if(user !== 'root'){
      out.err('useradd: Permission denied.');
      lastExitCode = 1;
      return;
    }
    const name = args[args.length - 1];
    if(!name || name.startsWith('-')){
      out.err('useradd: missing username');
      lastExitCode = 1;
      return;
    }
    const nextUid = Math.max(...Object.values(users).map(u => u.uid)) + 1;
    users[name] = { uid: nextUid, gid: nextUid, home: `/home/${name}`, shell: '/bin/bash', groups: [name] };
    groups[name] = nextUid;
    // create home
    root.entries['home'].entries[name] = {
      type: 'dir', inode: Math.floor(Math.random()*10000)+100,
      owner: name, group: name, mode: 0o750, mtime: 'Oct 29 10:15', entries: {}
    };
    lastExitCode = 0;
  }

  function handleUsermod(args, out){
    if(user !== 'root'){
      out.err('usermod: Permission denied.');
      lastExitCode = 1;
      return;
    }
    const target = args[args.length - 1];
    if(!users[target]){
      out.err(`usermod: user '${target}' does not exist`);
      lastExitCode = 6;
      return;
    }
    const gIdx = args.indexOf('-aG') !== -1 ? args.indexOf('-aG') : args.indexOf('-G');
    if(gIdx !== -1 && args[gIdx + 1]){
      const newGrps = args[gIdx + 1].split(',');
      newGrps.forEach(g => {
        if(!users[target].groups.includes(g)) users[target].groups.push(g);
      });
    }
    lastExitCode = 0;
  }

  function handlePs(args, out){
    out.say('USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND');
    runningProcesses.forEach(p => {
      out.say(`${p.user.padEnd(8,' ')} ${String(p.pid).padStart(6,' ')}  ${p.cpu.toFixed(1)}  ${p.mem.toFixed(1)} 245120 42100 ?        Ss   08:00   0:02 ${p.cmd}`);
    });
    lastExitCode = 0;
  }

  function handlePgrep(args, out){
    const showName = args.includes('-l');
    const term = args.filter(a => !a.startsWith('-'))[0];
    if(!term){ lastExitCode = 1; return; }
    const hits = runningProcesses.filter(p => p.cmd.includes(term));
    if(!hits.length){ lastExitCode = 1; return; }
    hits.forEach(p => out.say(showName ? `${p.pid} ${p.cmd.split(' ')[0]}` : String(p.pid)));
    lastExitCode = 0;
  }

  function handleKill(args, isPkill, out){
    let sig = '-15';
    let target = null;
    args.forEach(a => {
      if(a.startsWith('-')) sig = a;
      else target = a;
    });
    if(!target){
      out.err(isPkill ? 'pkill: no matching criteria specified' : 'kill: not enough arguments');
      lastExitCode = 1;
      return;
    }
    if(isPkill){
      const before = runningProcesses.length;
      runningProcesses = runningProcesses.filter(p => !p.cmd.includes(target));
      lastExitCode = runningProcesses.length < before ? 0 : 1;
      return;
    }
    const pid = parseInt(target, 10);
    const idx = runningProcesses.findIndex(p => p.pid === pid);
    if(idx === -1){
      out.err(`bash: kill: (${pid}) - No such process`);
      lastExitCode = 1;
      return;
    }
    runningProcesses.splice(idx, 1);
    lastExitCode = 0;
  }

  function handleTop(out){
    out.say('top - 10:15:30 up 14 days,  3:40,  2 users,  load average: 0.28, 0.42, 0.35');
    out.say('Tasks: 184 total,   1 running, 183 sleeping,   0 stopped,   0 zombie');
    out.say('%Cpu(s):  4.2 us,  1.8 sy,  0.0 ni, 93.5 id,  0.4 wa,  0.0 hi,  0.1 si,  0.0 st');
    out.say('MiB Mem :  64120.4 total,  38240.2 free,  14280.0 used,  11600.2 buff/cache');
    out.say('MiB Swap:   8192.0 total,   8192.0 free,      0.0 used.  48910.0 avail Mem');
    out.say('');
    out.say('    PID USER      PR  NI    VIRT    RES    SHR S  %CPU  %MEM     TIME+ COMMAND');
    out.say('   1420 oracle    20   0 4820100 2.412g  45120 S  12.4   3.8   4:15.22 java');
    out.say('   2102 oracle    20   0 3481200 1.820g 210400 S   4.2   2.9   2:10.15 xe_dbw0_FREE');
    out.say('   1103 nginx     20   0  145200  42100  12400 S   1.8   0.1   1:02.10 nginx');
    out.say('   2104 oracle    20   0 3481200  92100  45120 S   1.2   0.1   0:45.30 xe_lgwr_FREE');
    lastExitCode = 0;
  }

  function handleFree(args, out){
    const human = args.includes('-h');
    out.say('               total        used        free      shared  buff/cache   available');
    if(human){
      out.say('Mem:            62Gi        14Gi        37Gi       1.2Gi        11Gi        47Gi');
      out.say('Swap:          8.0Gi          0B       8.0Gi');
    } else {
      out.say('Mem:        65659289    14680064    39120896     1258291    11858329    49280128');
      out.say('Swap:        8388608           0     8388608');
    }
    lastExitCode = 0;
  }

  function handleSystemctl(args, out){
    const action = args[0];
    const cleanArgs = args.slice(1).filter(a => !a.startsWith('-'));
    const svcName = (cleanArgs[0] || '').replace(/\.service$/, '');

    if(action === 'is-active'){
      const s = services[svcName];
      const active = s && s.active;
      if(active){
        if(!args.includes('--quiet') && !args.includes('-q')) out.say('active');
        lastExitCode = 0;
      } else {
        if(!args.includes('--quiet') && !args.includes('-q')) out.say('inactive');
        lastExitCode = 3;
      }
      return;
    }

    if(!action || action === 'status'){
      if(!svcName){
        out.say('● prod-db01');
        out.say('    State: running');
        out.say('     Jobs: 0 queued');
        out.say('   Failed: 0 units');
        lastExitCode = 0;
        return;
      }
      const s = services[svcName];
      if(!s){
        out.err(`Unit ${svcName}.service could not be found.`);
        lastExitCode = 4;
        return;
      }
      out.say(`● ${s.name}.service - ${s.desc}`);
      out.say(`     Loaded: loaded (/usr/lib/systemd/system/${s.name}.service; ${s.enabled?'enabled':'disabled'}; vendor preset: enabled)`);
      out.say(`     Active: ${s.active?'active (running)':'inactive (dead)'} since Thu 2026-10-29 08:00:15 UTC`);
      if(s.active && s.port) out.say(`   Main PID: 1420 (${s.name})`);
      lastExitCode = s.active ? 0 : 3;
      return;
    }

    if(user !== 'root'){
      out.err(`Failed to ${action} ${svcName}.service: Access denied. (Try with sudo)`);
      lastExitCode = 1;
      return;
    }

    const s = services[svcName];
    if(!s){
      out.err(`Unit ${svcName}.service could not be found.`);
      lastExitCode = 4;
      return;
    }

    if(action === 'start'){ s.active = true; lastExitCode = 0; }
    else if(action === 'stop'){ s.active = false; lastExitCode = 0; }
    else if(action === 'restart'){ s.active = true; lastExitCode = 0; }
    else if(action === 'reload'){ s.active = true; lastExitCode = 0; }
    else if(action === 'enable'){ s.enabled = true; lastExitCode = 0; }
    else if(action === 'disable'){ s.enabled = false; lastExitCode = 0; }
  }

  function handleJournalctl(args, out){
    const uIdx = args.indexOf('-u');
    const uName = uIdx !== -1 ? args[uIdx + 1] : null;
    out.say('-- Logs begin at Thu 2026-10-29 00:00:01 UTC, end at Thu 2026-10-29 10:15:30 UTC. --');
    if(uName === 'nginx'){
      out.say('Oct 29 08:00:10 prod-db01 systemd[1]: Starting The NGINX HTTP and reverse proxy server...');
      out.say('Oct 29 08:00:12 prod-db01 systemd[1]: Started The NGINX HTTP and reverse proxy server.');
    } else if(uName === 'payapi'){
      if(services.payapi && services.payapi.active){
        out.say('Oct 29 08:00:15 prod-db01 payapi[1420]: [main] INFO org.springframework.boot.Startup - Started Application on port 8080');
      } else {
        out.say('Oct 29 10:14:02 prod-db01 systemd[1]: payapi.service: Main process exited, code=exited, status=1/FAILURE');
        out.say('Oct 29 10:14:02 prod-db01 systemd[1]: payapi.service: Failed with result "exit-code".');
      }
    } else {
      out.say('Oct 29 09:14:55 prod-db01 sshd[15402]: Accepted publickey for oracle from 10.0.1.25 port 54112 ssh2');
      out.say('Oct 29 10:00:01 prod-db01 CRON[18400]: (oracle) CMD (/home/oracle/scripts/healthcheck.sh)');
    }
    lastExitCode = 0;
  }

  function handleDf(args, out){
    const human = args.includes('-h');
    const inode = args.includes('-i');
    if(inode){
      out.say('Filesystem      Inodes   IUsed   IFree IUse% Mounted on');
      out.say('/dev/sda2      2621440  324100 2297340   13% /');
      out.say('/dev/sda3      1310720  980120  330600   75% /var/log');
      out.say('/dev/sda4      2293760  145000 2148760    7% /u01');
      lastExitCode = 0;
      return;
    }
    out.say('Filesystem      Size  Used Avail Use% Mounted on');
    if(human){
      out.say('/dev/sda2        40G   14G   24G  37% /');
      out.say('/dev/sda3        20G   17G  2.1G  89% /var/log');
      out.say('/dev/sda4        35G  8.2G   25G  25% /u01');
      out.say('tmpfs           3.2G     0  3.2G   0% /dev/shm');
    } else {
      out.say('/dev/sda2   41943040 14680064 25165824  37% /');
      out.say('/dev/sda3   20971520 17825792  2202000  89% /var/log');
      out.say('/dev/sda4   36700160  8598323 26214400  25% /u01');
    }
    lastExitCode = 0;
  }

  function handleDu(args, out){
    const human = args.includes('-h') || args.includes('-sh');
    const sum = args.includes('-s') || args.includes('-sh');
    const target = args.filter(a => !a.startsWith('-'))[0] || '.';
    const abs = normalize(target);
    const res = resolve(abs, true);
    if(!res){
      out.err(`du: cannot access '${target}': No such file or directory`);
      lastExitCode = 1;
      return;
    }
    if(sum){
      out.say(`${human?'1.3G':'1342177'}	${target}`);
    } else {
      out.say(`${human?'450M':'460800'}	${target}/app`);
      out.say(`${human?'820M':'839680'}	${target}/nginx`);
      out.say(`${human?'1.3G':'1342177'}	${target}`);
    }
    lastExitCode = 0;
  }

  function handleTar(args, out){
    const str = args.join(' ');
    const isCreate = str.includes('c');
    const isExtract = str.includes('x');
    const isList = str.includes('t');
    const fIdx = args.findIndex(a => a.startsWith('-') && a.includes('f'));
    const archName = fIdx !== -1 ? args[fIdx + 1] : args[1];

    if(isCreate){
      if(archName) writeRedir(archName, 'tar_archive_content\n', false, out);
      if(str.includes('v')){
        out.say('app/');
        out.say('app/app.env');
        out.say('app/package.json');
        out.say('app/server.js');
      } else {
        out.say(`tar: created archive '${archName}' successfully.`);
      }
      lastExitCode = 0;
      return;
    }
    if(isList){
      out.say('drwxr-xr-x oracle/oinstall  0 2026-10-29 10:15 app/');
      out.say('-rw------- oracle/oinstall 80 2026-10-29 10:15 app/app.env');
      out.say('-rw-r--r-- oracle/oinstall 210 2026-10-29 10:00 app/package.json');
      out.say('-rw-r--r-- oracle/oinstall 450 2026-10-29 10:00 app/server.js');
      lastExitCode = 0;
      return;
    }
    if(isExtract){
      out.say(`tar: extracted '${archName}' successfully.`);
      lastExitCode = 0;
      return;
    }
    lastExitCode = 0;
  }

  function handleGzip(args, isGunzip, out){
    const f = args.filter(a => !a.startsWith('-'))[0];
    if(!f){ lastExitCode = 1; return; }
    out.say(`${isGunzip ? 'uncompressed' : 'compressed'} ${f}`);
    lastExitCode = 0;
  }

  function handleRsync(args, out){
    const dest = args.filter(a => !a.startsWith('-'))[1];
    if(dest){
      const abs = normalize(dest);
      const res = resolve(abs, true);
      if(!res){
        const slash = abs.lastIndexOf('/');
        const parPath = abs.slice(0, slash) || '/';
        const dname = abs.slice(slash + 1);
        const par = resolve(parPath, true);
        if(par && par.node.type === 'dir'){
          const nDir = { type: 'dir', inode: Math.floor(Math.random()*10000)+500, owner: user, group: 'oinstall', mode: 0o755, mtime: 'Oct 29 10:15', entries: {} };
          par.node.entries[dname] = nDir;
          nDir.entries['app.env'] = { type: 'file', inode: Math.floor(Math.random()*10000)+500, owner: user, group: 'oinstall', mode: 0o600, mtime: 'Oct 29 10:15', content: 'PORT=3000\nAPP_ENV=dev\n', size: 22 };
          nDir.entries['package.json'] = { type: 'file', inode: Math.floor(Math.random()*10000)+500, owner: user, group: 'oinstall', mode: 0o644, mtime: 'Oct 29 10:00', content: '{\n  "name": "payment-api"\n}\n', size: 30 };
          nDir.entries['server.js'] = { type: 'file', inode: Math.floor(Math.random()*10000)+500, owner: user, group: 'oinstall', mode: 0o644, mtime: 'Oct 29 10:00', content: 'console.log("Server");\n', size: 24 };
        }
      }
    }
    out.say('sending incremental file list');
    out.say('created directory /tmp/app_sync');
    out.say('./');
    out.say('app.env');
    out.say('package.json');
    out.say('server.js');
    out.say('sent 840 bytes  received 92 bytes  1,864.00 bytes/sec');
    out.say('total size is 740  speedup is 0.79');
    lastExitCode = 0;
  }

  function handleIp(args, out){
    const sub = args[0] || 'a';
    if(sub === 'a' || sub === 'addr' || sub === '-br'){
      out.say('1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN');
      out.say('    inet 127.0.0.1/8 scope host lo');
      out.say('2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc mq state UP qlen 1000');
      out.say('    inet 10.0.1.10/24 brd 10.0.1.255 scope global eth0');
    } else if(sub === 'r' || sub === 'route'){
      out.say('default via 10.0.1.1 dev eth0 proto static');
      out.say('10.0.1.0/24 dev eth0 proto kernel scope link src 10.0.1.10');
    }
    lastExitCode = 0;
  }

  function handlePing(args, out){
    const host = args.filter(a => !a.startsWith('-'))[0] || '8.8.8.8';
    out.say(`PING ${host} (${host}) 56(84) bytes of data.`);
    out.say(`64 bytes from ${host}: icmp_seq=1 ttl=118 time=4.12 ms`);
    out.say(`64 bytes from ${host}: icmp_seq=2 ttl=118 time=4.08 ms`);
    out.say(`64 bytes from ${host}: icmp_seq=3 ttl=118 time=4.15 ms`);
    out.say(`--- ${host} ping statistics ---`);
    out.say(`3 packets transmitted, 3 received, 0% packet loss, time 2003ms`);
    lastExitCode = 0;
  }

  function handleSs(args, out){
    out.say('Netid State  Recv-Q Send-Q   Local Address:Port   Peer Address:Port Process');
    out.say('tcp   LISTEN 0      128            0.0.0.0:22          0.0.0.0:*     users:(("sshd",pid=810,fd=3))');
    out.say('tcp   LISTEN 0      511            0.0.0.0:80          0.0.0.0:*     users:(("nginx",pid=1102,fd=6))');
    out.say('tcp   LISTEN 0      128          127.0.0.1:1521        0.0.0.0:*     users:(("tnslsnr",pid=2110,fd=8))');
    if(services.payapi && services.payapi.active){
      out.say('tcp   LISTEN 0      100            0.0.0.0:8080        0.0.0.0:*     users:(("java",pid=1420,fd=14))');
    }
    lastExitCode = 0;
  }

  function handleLsof(args, out){
    if(args.includes('+L1')){
      out.say('COMMAND   PID   USER   FD   TYPE DEVICE SIZE/OFF NLINK NODE NAME');
      deletedOpenFiles.forEach(f => {
        out.say(`${f.cmd.padEnd(8,' ')} ${String(f.pid).padStart(5,' ')} ${f.user.padEnd(6,' ')} ${f.fd.padEnd(4,' ')}  REG    8,3  ${f.size.padStart(7,' ')}     0 98201 ${f.path}`);
      });
      lastExitCode = 0;
      return;
    }
    const portArg = args.find(a => a.startsWith('-i'));
    if(portArg && portArg.includes('8080')){
      if(services.payapi && services.payapi.active){
        out.say('COMMAND  PID   USER   FD   TYPE DEVICE SIZE/OFF NODE NAME');
        out.say('java    1420 oracle   14u  IPv6  48201      0t0  TCP *:8080 (LISTEN)');
      } else {
        lastExitCode = 1;
        return;
      }
    } else {
      out.say('COMMAND  PID   USER   FD   TYPE DEVICE SIZE/OFF NODE NAME');
      out.say('sshd     810   root    3u  IPv4  14200      0t0  TCP *:22 (LISTEN)');
      out.say('nginx   1102   root    6u  IPv4  20140      0t0  TCP *:80 (LISTEN)');
    }
    lastExitCode = 0;
  }

  function handleCurl(args, out){
    const isHead = args.includes('-I');
    const isSilent = args.includes('-s');
    const url = args.filter(a => !a.startsWith('-'))[0] || '';
    if(url.includes(':8080') || url.includes('/health')){
      if(!services.payapi || !services.payapi.active){
        out.err('curl: (7) Failed to connect to localhost port 8080: Connection refused');
        lastExitCode = 7;
        return;
      }
      if(isHead){
        out.say('HTTP/1.1 200 OK');
        out.say('Content-Type: application/json');
        out.say('Content-Length: 28');
      } else {
        out.say('{"status":"UP","db":"CONNECTED","version":"1.1.0"}');
      }
      lastExitCode = 0;
      return;
    }
    if(isHead){
      out.say('HTTP/1.1 200 OK');
      out.say('Server: nginx/1.24.0');
      out.say('Content-Type: text/html');
    } else {
      out.say('<!DOCTYPE html><html><body><h1>Welcome to prod-db01</h1></body></html>');
    }
    lastExitCode = 0;
  }

  function handleDns(args, out){
    const host = args.filter(a => !a.startsWith('+') && !a.startsWith('-'))[0] || 'corp.internal';
    if(host.includes('db01') || host.includes('localhost')) out.say('10.0.1.10');
    else if(host.includes('app01')) out.say('10.0.1.20');
    else out.say('93.184.216.34');
    lastExitCode = 0;
  }

  function handleSsh(args, out){
    const dest = args.filter(a => !a.startsWith('-'))[0] || '';
    out.say(`Authenticated to ${dest} using "publickey" (id_ed25519).`);
    out.say(`Welcome to ${dest} (remote shell)`);
    lastExitCode = 0;
  }

  function handleCrontab(args, out){
    if(args.includes('-l')){
      const curCron = cronTabs[user];
      if(!curCron || !curCron.trim()){
        out.err(`no crontab for ${user}`);
        lastExitCode = 1;
        return;
      }
      out.say(curCron.trim());
      lastExitCode = 0;
      return;
    }
    if(args.includes('-r')){
      delete cronTabs[user];
      lastExitCode = 0;
      return;
    }
    // install crontab from file argument
    const f = args.find(a => !a.startsWith('-'));
    if(f){
      const abs = normalize(f);
      const res = resolve(abs, true);
      if(!res || res.node.type !== 'file'){
        out.err(`crontab: ${f}: No such file or directory`);
        lastExitCode = 1;
        return;
      }
      cronTabs[user] = res.node.content;
      lastExitCode = 0;
      return;
    }
    lastExitCode = 0;
  }

  function handleExport(args, out){
    if(!args.length){
      for(const k of Object.keys(env).sort()) out.say(`declare -x ${k}="${env[k]}"`);
      lastExitCode = 0;
      return;
    }
    args.forEach(a => {
      const p = a.split('=');
      if(p.length >= 2){
        env[p[0]] = p.slice(1).join('=');
      }
    });
    lastExitCode = 0;
  }

  function handleUlimit(args, out){
    if(args.includes('-a')){
      out.say(`open files                      (-n) ${ulimits.nofile.soft}`);
      out.say(`max user processes              (-u) ${ulimits.nproc.soft}`);
      out.say(`stack size              (kbytes, -s) ${ulimits.stack.soft}`);
      out.say(`virtual memory          (kbytes, -v) unlimited`);
      lastExitCode = 0;
      return;
    }
    const nIdx = args.indexOf('-n');
    if(nIdx !== -1 && args[nIdx + 1]){
      ulimits.nofile.soft = parseInt(args[nIdx + 1], 10);
      lastExitCode = 0;
      return;
    }
    out.say(String(ulimits.nofile.soft));
    lastExitCode = 0;
  }

  function handleSysctl(args, out){
    if(args.includes('-p')){
      for(const k of Object.keys(sysctls)) out.say(`${k} = ${sysctls[k]}`);
      lastExitCode = 0;
      return;
    }
    const wIdx = args.indexOf('-w');
    if(wIdx !== -1 && args[wIdx + 1]){
      const p = args[wIdx + 1].split('=');
      sysctls[p[0].trim()] = p[1].trim();
      out.say(`${p[0].trim()} = ${p[1].trim()}`);
      lastExitCode = 0;
      return;
    }
    const key = args[0];
    if(key && sysctls[key]){
      out.say(`${key} = ${sysctls[key]}`);
      lastExitCode = 0;
      return;
    }
    for(const k of Object.keys(sysctls)) out.say(`${k} = ${sysctls[k]}`);
    lastExitCode = 0;
  }

  function handlePkg(mgr, args, out){
    const sub = args[0] || 'list';
    const pkg = args[1] || '';
    if(user !== 'root' && (sub === 'install' || sub === 'remove')){
      out.err(`${mgr}: Permission denied. This command has to be run with superuser privileges.`);
      lastExitCode = 1;
      return;
    }
    out.say(`Updating subscription repositories...`);
    out.say(`Package ${pkg || 'software'} is already the newest version.`);
    lastExitCode = 0;
  }

  function handleFw(mgr, args, out){
    if(mgr === 'ufw'){
      out.say('Status: active\nTo                         Action      From\n--                         ------      ----\n22/tcp                     ALLOW       Anywhere\n80/tcp                     ALLOW       Anywhere\n443/tcp                    ALLOW       Anywhere');
    } else {
      out.say('public (active)\n  target: default\n  services: cockpit dhcpv6-client ssh\n  ports: 22/tcp 80/tcp 443/tcp 1521/tcp 8080/tcp');
    }
    lastExitCode = 0;
  }

  /* Text Processing: grep, sort, uniq, cut, awk, sed */
  function handleGrep(args, out){
    const { flags, pattern, files } = parseGrepArgs(args);
    if(!pattern){ lastExitCode = 1; return; }
    if(!files.length){ lastExitCode = 0; return; }

    files.forEach(f => {
      const abs = normalize(f);
      const res = resolve(abs, true);
      if(!res || res.node.type !== 'file'){
        out.err(`grep: ${f}: No such file or directory`);
        lastExitCode = 2;
        return;
      }
      const lines = res.node.content.split('\n');
      if(lines[lines.length - 1] === '') lines.pop();
      filterGrepLines(lines, pattern, flags, out);
    });
  }

  function handleGrepPipe(args, stdinLines, out){
    const { flags, pattern, files } = parseGrepArgs(args);
    if(!pattern){ lastExitCode = 1; return; }
    if(files.length){
      files.forEach(f => {
        const abs = normalize(f);
        const res = resolve(abs, true);
        if(!res || res.node.type !== 'file'){
          out.err(`grep: ${f}: No such file or directory`);
          lastExitCode = 2;
          return;
        }
        const lines = res.node.content.split('\n');
        if(lines[lines.length - 1] === '') lines.pop();
        filterGrepLines(lines, pattern, flags, out);
      });
      return;
    }
    filterGrepLines(stdinLines, pattern, flags, out);
  }

  function parseGrepArgs(args){
    let caseIns = false, invert = false, lineNum = false, count = false;
    let pattern = null;
    const files = [];
    for(let i = 0; i < args.length; i++){
      const a = args[i];
      if(a === '-i') caseIns = true;
      else if(a === '-v') invert = true;
      else if(a === '-n') lineNum = true;
      else if(a === '-c') count = true;
      else if(a === '-E' && args[i+1]){ pattern = args[++i]; }
      else if(a.startsWith('-') && a.includes('i')) caseIns = true;
      else if(a.startsWith('-') && a.includes('v')) invert = true;
      else if(!pattern) pattern = a;
      else files.push(a);
    }
    return { flags: { caseIns, invert, lineNum, count }, pattern, files };
  }

  function filterGrepLines(lines, pattern, flags, out){
    const re = new RegExp(pattern, flags.caseIns ? 'i' : '');
    let matchedCount = 0;
    lines.forEach((l, idx) => {
      const hit = re.test(l);
      if((hit && !flags.invert) || (!hit && flags.invert)){
        matchedCount++;
        if(!flags.count){
          out.say(flags.lineNum ? `${idx + 1}:${l}` : l);
        }
      }
    });
    if(flags.count) out.say(String(matchedCount));
    lastExitCode = matchedCount > 0 ? 0 : 1;
  }

  function handleSort(args, out){
    const files = args.filter(a => !a.startsWith('-'));
    if(!files.length){ lastExitCode = 0; return; }
    const file = files[0];
    const abs = normalize(file);
    const res = resolve(abs, true);
    if(!res || res.node.type !== 'file'){
      out.err(`sort: cannot read: ${file}: No such file or directory`);
      lastExitCode = 2;
      return;
    }
    const lines = res.node.content.split('\n').filter(Boolean);
    handleSortPipe(args, lines, out);
  }

  function handleSortPipe(args, lines, out){
    let reverse = args.some(a => a.startsWith('-') && a.includes('r'));
    let numeric = args.some(a => a.startsWith('-') && a.includes('n'));
    let unique = args.some(a => a.startsWith('-') && a.includes('u'));
    let list = lines.slice();
    if(unique) list = [...new Set(list)];
    list.sort((a, b) => {
      if(numeric){
        const na = parseFloat(a.trim().match(/^-?\d+/)||0);
        const nb = parseFloat(b.trim().match(/^-?\d+/)||0);
        return na - nb;
      }
      return a.localeCompare(b);
    });
    if(reverse) list.reverse();
    list.forEach(l => out.say(l));
    lastExitCode = 0;
  }

  function handleUniq(args, out){
    const files = args.filter(a => !a.startsWith('-'));
    if(!files.length){ lastExitCode = 0; return; }
    const abs = normalize(files[0]);
    const res = resolve(abs, true);
    if(!res || res.node.type !== 'file'){
      out.err(`uniq: '${files[0]}': No such file or directory`);
      lastExitCode = 1;
      return;
    }
    const lines = res.node.content.split('\n').filter(Boolean);
    handleUniqPipe(args, lines, out);
  }

  function handleUniqPipe(args, lines, out){
    const count = args.some(a => a.startsWith('-') && a.includes('c'));
    let prev = null, ct = 0;
    const emit = () => {
      if(prev !== null){
        out.say(count ? `${String(ct).padStart(7,' ')} ${prev}` : prev);
      }
    };
    for(const l of lines){
      if(l === prev) ct++;
      else {
        emit();
        prev = l;
        ct = 1;
      }
    }
    emit();
    lastExitCode = 0;
  }

  function handleCut(args, out){
    const files = args.filter(a => !a.startsWith('-'));
    if(!files.length){ lastExitCode = 0; return; }
    const abs = normalize(files[0]);
    const res = resolve(abs, true);
    if(!res || res.node.type !== 'file'){
      out.err(`cut: ${files[0]}: No such file or directory`);
      lastExitCode = 1;
      return;
    }
    const lines = res.node.content.split('\n').filter(Boolean);
    handleCutPipe(args, lines, out);
  }

  function handleCutPipe(args, lines, out){
    let delim = '\t';
    let fields = [1];
    for(let i = 0; i < args.length; i++){
      if(args[i].startsWith('-d')){
        delim = args[i].length > 2 ? args[i].slice(2) : args[++i];
      } else if(args[i].startsWith('-f')){
        const str = args[i].length > 2 ? args[i].slice(2) : args[++i];
        fields = str.split(',').map(n => +n);
      }
    }
    lines.forEach(l => {
      const parts = l.split(delim);
      const sel = fields.map(fi => parts[fi - 1] || '').join(delim);
      out.say(sel);
    });
    lastExitCode = 0;
  }

  function handleAwk(args, out){
    const nonFlags = args.filter(a => !a.startsWith('-'));
    let script = nonFlags[0] || '{print}';
    const files = nonFlags.slice(1);
    let delim = ' ';
    for(let i = 0; i < args.length; i++){
      if(args[i].startsWith('-F')) delim = args[i].length > 2 ? args[i].slice(2) : args[++i];
    }
    delim = delim.replace(/^['"]|['"]$/g, '');

    if(!files.length){ lastExitCode = 0; return; }
    const abs = normalize(files[0]);
    const res = resolve(abs, true);
    if(!res || res.node.type !== 'file'){
      out.err(`awk: cannot open ${files[0]} (No such file or directory)`);
      lastExitCode = 2;
      return;
    }
    const lines = res.node.content.split('\n').filter(Boolean);
    handleAwkPipe(args, lines, out);
  }

  function handleAwkPipe(args, lines, out){
    let delim = ' ';
    for(let i = 0; i < args.length; i++){
      if(args[i].startsWith('-F')) delim = args[i].length > 2 ? args[i].slice(2) : args[++i];
    }
    delim = delim.replace(/^['"]|['"]$/g, '');
    const nonFlags = args.filter(a => !a.startsWith('-'));
    let script = nonFlags[0] || '{print}';
    script = script.replace(/^['"]|['"]$/g, '');

    // Support common patterns:
    // NR>1 && $4>50000 { print $2, $4 }
    // { sum += $4 } END { print sum }
    // { print $1, $3 }
    let sum = 0;
    const hasSum = /sum\s*\+=\s*\$(\d+)/.test(script);
    const sumCol = hasSum ? +script.match(/sum\s*\+=\s*\$(\d+)/)[1] : 0;
    const hasEnd = /END\s*\{\s*print\s+sum\s*\}/i.test(script);

    lines.forEach((l, idx) => {
      const nr = idx + 1;
      const parts = delim === ' ' ? l.trim().split(/\s+/) : l.split(delim);
      const nf = parts.length;

      if(hasSum && sumCol){
        const val = parseFloat(parts[sumCol - 1]) || 0;
        sum += val;
      }

      // Check condition
      if(/NR\s*>\s*1/.test(script) && nr === 1) return;
      if(/\$(\d+)\s*>\s*(\d+)/.test(script)){
        const m = script.match(/\$(\d+)\s*>\s*(\d+)/);
        const colVal = parseFloat(parts[+m[1] - 1]) || 0;
        if(colVal <= +m[2]) return;
      }
      if(/\$(\d+)\s*==\s*["']?([^"'\s]+)["']?/.test(script)){
        const m = script.match(/\$(\d+)\s*==\s*["']?([^"'\s]+)["']?/);
        const colVal = parts[+m[1] - 1];
        if(colVal !== m[2]) return;
      }

      if(!hasEnd){
        // Print columns
        if(script.includes('print')){
          const printBody = script.match(/print\s+(.*?)(\}|$)/);
          if(!printBody || !printBody[1] || printBody[1] === '$0'){
            out.say(l);
          } else {
            const cols = printBody[1].split(/[, ]+/).filter(Boolean);
            const vals = cols.map(c => {
              if(c === '$0') return l;
              if(c === '$NF') return parts[parts.length - 1] || '';
              if(/^\$(\d+)$/.test(c)){
                const colIdx = +c.slice(1);
                return parts[colIdx - 1] || '';
              }
              return c.replace(/^['"]|['"]$/g, '');
            });
            out.say(vals.join(' '));
          }
        }
      }
    });

    if(hasEnd){
      out.say(String(sum));
    }
    lastExitCode = 0;
  }

  function handleSed(args, out){
    const isInline = args.includes('-i') || args.some(a => a.startsWith('-i'));
    const files = args.filter(a => !a.startsWith('-') && !a.startsWith('s') && !a.startsWith('/') && !a.startsWith('1'));
    const expr = args.find(a => a.startsWith('s') || a.startsWith('/') || /^\d/.test(a) || a.includes('s/')) || '';
    if(!files.length){ lastExitCode = 0; return; }
    const abs = normalize(files[0]);
    const res = resolve(abs, true);
    if(!res || res.node.type !== 'file'){
      out.err(`sed: can't read ${files[0]}: No such file or directory`);
      lastExitCode = 2;
      return;
    }
    const lines = res.node.content.split('\n');
    if(lines[lines.length - 1] === '') lines.pop();

    const result = applySedExpr(lines, expr);
    if(isInline){
      res.node.content = result.join('\n') + '\n';
      res.node.size = res.node.content.length;
    } else {
      result.forEach(l => out.say(l));
    }
    lastExitCode = 0;
  }

  function handleSedPipe(args, lines, out){
    const expr = args.find(a => a.startsWith('s') || a.startsWith('/') || /^\d/.test(a) || a.includes('s/')) || '';
    const res = applySedExpr(lines, expr);
    res.forEach(l => out.say(l));
    lastExitCode = 0;
  }

  function applySedExpr(lines, expr){
    let clean = expr.replace(/^['"]|['"]$/g, '');
    // s/old/new/g or s|old|new|g
    if(clean.startsWith('s')){
      const sep = clean[1];
      const p = clean.slice(2).split(sep);
      const find = p[0], repl = p[1], flags = p[2] || '';
      const re = new RegExp(find, flags.includes('g') ? 'g' : '');
      return lines.map(l => l.replace(re, repl));
    }
    // Delete comment lines: /^#/d
    if(clean === '/^#/d'){
      return lines.filter(l => !l.trim().startsWith('#'));
    }
    // Specific line delete: 5d
    if(/^\d+d$/.test(clean)){
      const n = parseInt(clean, 10);
      return lines.filter((_, i) => i + 1 !== n);
    }
    return lines;
  }

  function handleHeadPipe(args, lines, out){
    const files = args.filter(a => !a.startsWith('-'));
    if(files.length){ handleHead(args, out); return; }
    let n = 10;
    for(let i = 0; i < args.length; i++){
      if(args[i] === '-n' && args[i+1]) n = parseInt(args[++i], 10) || 10;
      else if(/^-\d+$/.test(args[i])) n = parseInt(args[i].slice(1), 10);
    }
    lines.slice(0, n).forEach(l => out.say(l));
    lastExitCode = 0;
  }

  function handleTailPipe(args, lines, out){
    const files = args.filter(a => !a.startsWith('-'));
    if(files.length){ handleTail(args, out); return; }
    let n = 10;
    for(let i = 0; i < args.length; i++){
      if(args[i] === '-n' && args[i+1]) n = parseInt(args[++i], 10) || 10;
      else if(/^-\d+$/.test(args[i])) n = parseInt(args[i].slice(1), 10);
    }
    lines.slice(Math.max(0, lines.length - n)).forEach(l => out.say(l));
    lastExitCode = 0;
  }

  function handleWcPipe(args, lines, out){
    const files = args.filter(a => !a.startsWith('-'));
    if(files.length){ handleWc(args, out); return; }
    const lineOnly = args.includes('-l');
    if(lineOnly) out.say(String(lines.length));
    else {
      const text = lines.join('\n');
      const words = text.trim().split(/\s+/).filter(Boolean).length;
      out.say(`${lines.length} ${words} ${text.length}`);
    }
    lastExitCode = 0;
  }

  function handleTrPipe(args, lines, out){
    const text = lines.join('\n');
    let res = text;
    if(args.includes('-d')){
      const ch = args[args.indexOf('-d') + 1] || '';
      res = text.split(ch.replace(/^['"]|['"]$/g, '')).join('');
    } else if(args.length >= 2){
      const a = args[0].replace(/^['"]|['"]$/g, '');
      const b = args[1].replace(/^['"]|['"]$/g, '');
      if(a === 'a-z' && b === 'A-Z') res = text.toUpperCase();
      else if(a === 'A-Z' && b === 'a-z') res = text.toLowerCase();
    }
    res.split('\n').forEach(l => out.say(l));
    lastExitCode = 0;
  }
}

return { create };
})();


const LINUX_LESSONS = [
  {
    "id": "lx-intro",
    "course": "linux",
    "sec": "Shuruaat aur Filesystem",
    "title": "Linux kya hai? Kernel, Shell aur Terminal",
    "url": "https://man7.org/linux/man-pages/man1/bash.1.html",
    "meta": "Linux · prod-db01 · bash",
    "summary": "Linux operating system ka dhancha samjho: Kernel (hardware ka boss), Shell (bash interpreter jo tumhari commands sunta hai), aur Terminal.",
    "simple": "Car socho. Car ka engine = Kernel jo hardware (wheels, brakes) chalata hai. Steering wheel aur accelerator = Shell (bash) jisse driver car ko command deta hai. Aur driver ki seat = Terminal jahan tum baithte ho.",
    "words": [
      [
        "Kernel",
        "Operating system ka core engine jo CPU, RAM aur disks ko control karta hai."
      ],
      [
        "Shell",
        "Command interpreter (jaise bash) jo tumhari commands padh kar execute karta hai."
      ],
      [
        "Terminal",
        "Black screen / CLI window jahan commands type karte ho."
      ],
      [
        "whoami",
        "Current logged-in user ka username dikhane wali command."
      ],
      [
        "hostname",
        "Server / computer ka network naam batata hai."
      ],
      [
        "uname",
        "Operating system aur kernel version dikhata hai (uname -a)."
      ]
    ],
    "nodes": [
      [
        "hw",
        "region",
        24,
        24,
        240,
        244,
        "Hardware",
        {
          "tone": "file",
          "sub": "Physical Server"
        }
      ],
      [
        "cpu",
        "box",
        40,
        62,
        96,
        52,
        "CPU (4c)",
        {
          "tone": "file",
          "small": 1
        }
      ],
      [
        "ram",
        "box",
        152,
        62,
        96,
        52,
        "RAM 16G",
        {
          "tone": "file",
          "small": 1
        }
      ],
      [
        "disk",
        "disk",
        94,
        132,
        100,
        74,
        "NVMe Disk",
        {
          "tone": "file",
          "level": 0.42,
          "sub": "/dev/sda"
        }
      ],
      [
        "kern",
        "region",
        292,
        24,
        260,
        244,
        "Linux Kernel",
        {
          "tone": "proc",
          "sub": "OS Core Engine"
        }
      ],
      [
        "sched",
        "proc",
        312,
        66,
        220,
        42,
        "Process Scheduler",
        {
          "tone": "proc"
        }
      ],
      [
        "mem",
        "proc",
        312,
        122,
        220,
        42,
        "Memory Manager",
        {
          "tone": "proc"
        }
      ],
      [
        "drv",
        "proc",
        312,
        178,
        220,
        42,
        "VFS & Device Drivers",
        {
          "tone": "proc"
        }
      ],
      [
        "sh",
        "proc",
        584,
        34,
        190,
        56,
        "Bash Shell",
        {
          "tone": "accent",
          "sub": "/bin/bash"
        }
      ],
      [
        "user",
        "user",
        648,
        128,
        62,
        54,
        "Tum / Admin",
        {
          "tone": "mem",
          "sub": "oracle@prod-db01"
        }
      ],
      [
        "v_who",
        "var",
        800,
        38,
        136,
        46,
        "USER (whoami)",
        {
          "v": "?",
          "tone": "accent"
        }
      ],
      [
        "v_host",
        "var",
        800,
        104,
        136,
        46,
        "HOSTNAME",
        {
          "v": "?",
          "tone": "mem"
        }
      ],
      [
        "v_kern",
        "var",
        800,
        170,
        136,
        46,
        "KERNEL",
        {
          "v": "?",
          "tone": "proc"
        }
      ],
      [
        "c_up",
        "chip",
        584,
        234,
        352,
        30,
        "Uptime: checking...",
        {
          "tone": "ok"
        }
      ],
      [
        "term",
        "term",
        24,
        286,
        912,
        224,
        "Terminal · oracle@prod-db01:~"
      ]
    ],
    "code": [
      "# 1. Check who you are logged in as",
      "whoami",
      "# 2. Check the server hostname",
      "hostname",
      "# 3. Check Linux OS and Kernel version",
      "uname -a",
      "# 4. Check how long the server has been running",
      "uptime"
    ],
    "codeTitle": "Bash · prod-db01",
    "steps": [
      {
        "say": "Production mein 90% enterprise databases aur cloud apps Linux par chalte hain. Server par koi Windows jaisa GUI nahi hota, sirf black screen terminal hota hai.",
        "ops": [
          [
            "show",
            "user",
            "sh",
            "term"
          ],
          [
            "link",
            "user",
            "sh",
            {
              "tone": "accent",
              "label": "CLI"
            }
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ "
          ]
        ],
        "vo": "प्रोडक्शन में नब्बे परसेंट एंटरप्राइज डेटाबेस और क्लाउड ऐप्स लिनक्स पर चलते हैं। सर्वर पर कोई विंडोज़ जैसा जी-यू-आई नहीं होता, सिर्फ़ ब्लैक स्क्रीन टर्मिनल होता है।"
      },
      {
        "say": "Linux ke 3 main hisse hote hain: Hardware (CPU, RAM, Disks), Kernel (hardware ko manage karne wala engine), aur Shell (jo tumhari baat Kernel tak pahunchata hai).",
        "ops": [
          [
            "show",
            "hw",
            "cpu",
            "ram",
            "disk",
            "kern",
            "sched",
            "mem",
            "drv"
          ],
          [
            "link",
            "sh",
            "kern",
            {
              "tone": "proc",
              "label": "syscalls"
            }
          ],
          [
            "link",
            "kern",
            "hw",
            {
              "tone": "file",
              "label": "drivers"
            }
          ],
          [
            "pulse",
            "kern"
          ]
        ],
        "vo": "लिनक्स के तीन मेन हिस्से होते हैं: हार्डवेयर यानी सी-पी-यू, रैम और डिस्क्स, कर्नल जो हार्डवेयर को मैनेज करने वाला इंजन है, और शेल जो तुम्हारी बात कर्नल तक पहुँचाता है।"
      },
      {
        "say": "Jab tum terminal mein `whoami` type karte ho, Shell use samajhta hai aur batata hai ki tum kis user account se logged in ho.",
        "code": [
          0,
          1
        ],
        "ops": [
          [
            "show",
            "v_who"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ whoami"
          ],
          [
            "flow",
            "user",
            "sh",
            "whoami",
            {
              "tone": "accent",
              "dur": 600
            }
          ],
          [
            "flow",
            "sh",
            "kern",
            "getuid()",
            {
              "tone": "proc",
              "dur": 600
            }
          ],
          [
            "val",
            "v_who",
            "oracle",
            {
              "tone": "ok"
            }
          ],
          [
            "out",
            "term",
            "oracle"
          ]
        ],
        "vo": "जब तुम टर्मिनल में हू-एम-आई टाइप करते हो, शेल उसे समझता है और बताता है कि तुम किस यूज़र अकाउंट से लॉग्ड इन हो।"
      },
      {
        "say": "`hostname` server ka pehchaan naam dikhata hai, jaise `prod-db01`. Production mein hamesha check karo ki galti se production par kaam toh nahi kar rahe!",
        "code": [
          2,
          3
        ],
        "ops": [
          [
            "show",
            "v_host"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ hostname"
          ],
          [
            "flow",
            "sh",
            "kern",
            "gethostname",
            {
              "tone": "mem",
              "dur": 600
            }
          ],
          [
            "val",
            "v_host",
            "prod-db01",
            {
              "tone": "accent"
            }
          ],
          [
            "out",
            "term",
            "prod-db01"
          ]
        ],
        "vo": "होस्टनेम सर्वर का पहचान नाम दिखाता है, जैसे प्रोड-डी-बी ज़ीरो वन। प्रोडक्शन में हमेशा चेक करो कि ग़लती से प्रोडक्शन पर काम तो नहीं कर रहे!"
      },
      {
        "say": "`uname -a` se poora Linux kernel version aur architecture (x86_64) pata chalta hai. `uptime` batata hai server kitne din se bina band huye chal raha hai.",
        "code": [
          4,
          5,
          6,
          7
        ],
        "ops": [
          [
            "show",
            "v_kern",
            "c_up"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ uname -a"
          ],
          [
            "flow",
            "kern",
            "cpu",
            "uname",
            {
              "tone": "proc",
              "dur": 550
            }
          ],
          [
            "val",
            "v_kern",
            "5.15.0 x86_64",
            {
              "tone": "proc"
            }
          ],
          [
            "out",
            "term",
            "Linux prod-db01 5.15.0-88-generic #98-Ubuntu SMP Mon Oct 2 15:18:56 UTC 2026 x86_64 GNU/Linux"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ uptime"
          ],
          [
            "label",
            "c_up",
            "up 14 days · 2 users · load: 0.28, 0.42, 0.35"
          ],
          [
            "out",
            "term",
            " 10:15:22 up 14 days,  3:40,  2 users,  load average: 0.28, 0.42, 0.35"
          ],
          [
            "ok",
            "user"
          ],
          [
            "ok",
            "kern"
          ]
        ],
        "vo": "यू-नेम डैश ए से पूरा लिनक्स कर्नल वर्ज़न और आर्किटेक्चर पता चलता है। अपटाइम बताता है सर्वर कितने दिन से बिना बंद हुए चल रहा है।"
      }
    ],
    "points": [
      "Linux server par koi GUI desktop nahi hota; saara production kaam bash terminal se hota hai.",
      "Kernel hardware (CPU, RAM, Disk) control karta hai; Shell tumhari commands ko Kernel tak bhejta hai.",
      "`whoami` = logged-in user check karna; `hostname` = server ka naam verify karna.",
      "`uname -a` = OS kernel version; `uptime` = server kitni der se chalu hai."
    ],
    "check": {
      "q": "Server par login karne ke baad kis command se verify karoge ki tum kis user se logged in ho?",
      "a": [
        "uname",
        "hostname",
        "whoami",
        "uptime"
      ],
      "c": 2,
      "why": "`whoami` current session ka username (jaise oracle ya root) print karta hai."
    },
    "syntax": {
      "code": "whoami\nhostname\nuname -a\nuptime",
      "parts": [
        [
          "whoami",
          "Current user ka naam batata hai."
        ],
        [
          "hostname",
          "Server ka network name dikhata hai."
        ],
        [
          "uname -a",
          "All system information: kernel release, version, architecture."
        ],
        [
          "uptime",
          "Server running time aur CPU load average dikhata hai."
        ]
      ]
    },
    "scenario": "Jab bhi DBA ya DevOps engineer SSH se naye server par login karta hai, uska pehla rule hota hai: `hostname` aur `whoami` check karna taaki verify ho sake ki sahi environment (staging vs production) par connected hain aur permissions kya hain.",
    "tasks": [
      {
        "t": "Pata lagao abhi tum kis user account se logged in ho (`whoami`).",
        "sql": "whoami"
      },
      {
        "t": "Server ka hostname check karo.",
        "sql": "hostname"
      },
      {
        "t": "Server ka OS kernel details (`uname -a`) aur running uptime dikhao.",
        "sql": "uname -a\nuptime"
      }
    ],
    "mistakes": [
      {
        "bad": "who am i",
        "err": "different output",
        "why": "`whoami` bina space ke ek command hai. `who am i` purana Unix command hai jo login terminal line details deta hai.",
        "fix": "whoami"
      },
      {
        "bad": "uname -A",
        "err": "invalid option",
        "why": "Linux commands case-sensitive hote hain. `uname -a` lowercase `a` hota hai, uppercase `A` invalid flag hai.",
        "fix": "uname -a"
      }
    ],
    "intro": "कार सोचो। कार का इंजन बराबर कर्नल, जो हार्डवेयर जैसे व्हील्स और ब्रेक्स चलाता है। स्टीयरिंग व्हील और एक्सेलरेटर बराबर शेल, यानी बैश, जिससे ड्राइवर कार को कमांड देता है। और ड्राइवर की सीट बराबर टर्मिनल, जहाँ तुम बैठते हो।"
  },
  {
    "id": "lx-tree",
    "course": "linux",
    "sec": "Shuruaat aur Filesystem",
    "title": "Linux Directory Tree: / se /var, /etc, /u01 tak",
    "url": "https://man7.org/linux/man-pages/man7/hier.7.html",
    "meta": "Linux · prod-db01 · bash",
    "summary": "Linux filesystem ka ulta ped (inverted tree) samjho: Windows ke C:\\ D:\\ ke bajaye sab kuch ek hi root `/` se shuru hota hai.",
    "simple": "Dukaan ka bada almirah socho. Almirah ka sabse bada darwaza = `/` (root). Uske andar alag alag khane hain: bill book aur policy = `/etc`, stock register = `/var/log`, har staff ka apna personal locker = `/home/oracle`.",
    "words": [
      [
        "Root (/)",
        "Linux filesystem ka shuruaati point; har file aur folder iske neeche aata hai."
      ],
      [
        "/etc",
        "System configuration files ka folder (jaise /etc/hosts, /etc/passwd)."
      ],
      [
        "/var/log",
        "Application aur OS ke log files jahan error aur events record hote hain."
      ],
      [
        "/home",
        "Normal users ke home folders (jaise /home/oracle)."
      ],
      [
        "/u01",
        "Enterprise/Oracle database software aur datafiles ka standard mount point."
      ],
      [
        "pwd",
        "Print Working Directory: abhi tum kis folder mein khade ho."
      ],
      [
        "cd",
        "Change Directory: ek folder se doosre folder mein jaana."
      ]
    ],
    "nodes": [
      [
        "root",
        "proc",
        340,
        22,
        110,
        40,
        "/ (Root)",
        {
          "tone": "accent"
        }
      ],
      [
        "etc",
        "box",
        30,
        96,
        130,
        48,
        "/etc",
        {
          "sub": "system configs",
          "tone": "file",
          "small": 1
        }
      ],
      [
        "var",
        "box",
        180,
        96,
        130,
        48,
        "/var",
        {
          "sub": "logs & spool",
          "tone": "file",
          "small": 1
        }
      ],
      [
        "home",
        "box",
        330,
        96,
        130,
        48,
        "/home",
        {
          "sub": "user homes",
          "tone": "file",
          "small": 1
        }
      ],
      [
        "u01",
        "box",
        480,
        96,
        130,
        48,
        "/u01",
        {
          "sub": "Oracle DB base",
          "tone": "file",
          "small": 1
        }
      ],
      [
        "tmp",
        "box",
        630,
        96,
        110,
        48,
        "/tmp",
        {
          "sub": "scratchpad",
          "tone": "muted",
          "small": 1
        }
      ],
      [
        "vlog",
        "doc",
        180,
        182,
        130,
        56,
        "/var/log",
        {
          "sub": "syslog, nginx",
          "tone": "mem"
        }
      ],
      [
        "ohome",
        "doc",
        330,
        182,
        130,
        56,
        "/home/oracle",
        {
          "sub": "~ (default home)",
          "tone": "ok"
        }
      ],
      [
        "odata",
        "disk",
        480,
        174,
        130,
        56,
        "/u01/oradata",
        {
          "sub": ".dbf datafiles",
          "tone": "accent",
          "level": 0.55
        }
      ],
      [
        "cwd",
        "var",
        765,
        42,
        170,
        52,
        "Current Dir (pwd)",
        {
          "v": "/home/oracle",
          "tone": "ok"
        }
      ],
      [
        "prev",
        "var",
        765,
        118,
        170,
        52,
        "OLDPWD (cd -)",
        {
          "v": "(none)",
          "tone": "muted"
        }
      ],
      [
        "nav",
        "chip",
        765,
        196,
        170,
        30,
        ".. = up · ~ = home",
        {
          "tone": "accent"
        }
      ],
      [
        "term",
        "term",
        24,
        278,
        912,
        232,
        "Terminal · Filesystem Navigation"
      ]
    ],
    "code": [
      "# 1. Print current working directory",
      "pwd",
      "# 2. Change to /var/log directory",
      "cd /var/log",
      "pwd",
      "# 3. Go up one level to /var",
      "cd ..",
      "# 4. Jump back to home directory (~)",
      "cd ~",
      "# 5. Toggle back to previous directory",
      "cd -"
    ],
    "codeTitle": "Bash · prod-db01",
    "steps": [
      {
        "say": "Windows mein alag alag drives hote hain (C:, D:, E:). Linux mein sirf ek hi root directory hoti hai, jise forward-slash `/` kehte hain. Saari hard disks isi ped mein mount hoti hain.",
        "ops": [
          [
            "show",
            "root"
          ],
          [
            "pulse",
            "root"
          ],
          [
            "show",
            "etc",
            "var",
            "home",
            "u01",
            "tmp"
          ],
          [
            "link",
            "root",
            "etc",
            {
              "tone": "file"
            }
          ],
          [
            "&link",
            "root",
            "var",
            {
              "tone": "file"
            }
          ],
          [
            "&link",
            "root",
            "home",
            {
              "tone": "file"
            }
          ],
          [
            "&link",
            "root",
            "u01",
            {
              "tone": "file"
            }
          ],
          [
            "&link",
            "root",
            "tmp",
            {
              "tone": "muted"
            }
          ]
        ],
        "vo": "विंडोज़ में अलग-अलग ड्राइव्स होते हैं, जैसे सी और डी। लिनक्स में सिर्फ़ एक ही रूट डायरेक्टरी होती है, जिसे फॉरवर्ड-स्लैश कहते हैं। सारी हार्ड डिस्क्स इसी पेड़ में माउंट होती हैं।"
      },
      {
        "say": "Har folder ka ek maksad hai: `/etc` mein server aur software ki settings (configs) rehti hain; `/var/log` mein running apps ke logs; `/home` mein users ka data; aur `/u01` mein Oracle Database software aur datafiles.",
        "ops": [
          [
            "show",
            "vlog",
            "ohome",
            "odata"
          ],
          [
            "link",
            "var",
            "vlog",
            {
              "tone": "mem"
            }
          ],
          [
            "&link",
            "home",
            "ohome",
            {
              "tone": "ok"
            }
          ],
          [
            "&link",
            "u01",
            "odata",
            {
              "tone": "accent"
            }
          ],
          [
            "pulse",
            "ohome"
          ],
          [
            "pulse",
            "vlog"
          ],
          [
            "pulse",
            "odata"
          ]
        ],
        "vo": "हर फ़ोल्डर का एक मक़सद है: स्लैश ई-टी-सी में सर्वर और सॉफ़्टवेयर की सेटिंग्स रहती हैं, स्लैश वार स्लैश लॉग में रनिंग ऐप्स के लॉग्स, स्लैश होम में यूज़र्स का डेटा, और स्लैश यू-ज़ीरो-वन में ओरेकल डेटाबेस सॉफ़्टवेयर और डेटाफ़ाइल्स।"
      },
      {
        "say": "`pwd` command batata hai ki abhi tum filesystem ke kis folder mein khade ho. `cd /var/log` se seedha logs folder mein pahunch jaate ho.",
        "code": [
          0,
          1,
          2,
          3
        ],
        "ops": [
          [
            "show",
            "cwd",
            "prev",
            "term"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ pwd"
          ],
          [
            "out",
            "term",
            "/home/oracle"
          ],
          [
            "ok",
            "ohome"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ cd /var/log"
          ],
          [
            "flow",
            "ohome",
            "vlog",
            "cd /var/log",
            {
              "tone": "accent",
              "dur": 700
            }
          ],
          [
            "unok",
            "ohome"
          ],
          [
            "ok",
            "vlog"
          ],
          [
            "val",
            "prev",
            "/home/oracle",
            {
              "tone": "muted"
            }
          ],
          [
            "val",
            "cwd",
            "/var/log",
            {
              "tone": "accent"
            }
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:/var/log$ pwd"
          ],
          [
            "out",
            "term",
            "/var/log"
          ]
        ],
        "vo": "पी-डब्ल्यू-डी कमांड बताता है कि अभी तुम फ़ाइलसिस्टम के किस फ़ोल्डर में खड़े हो। सी-डी स्लैश वार स्लैश लॉग से सीधा लॉग्स फ़ोल्डर में पहुँच जाते हो।"
      },
      {
        "say": "Navigation ke shortcuts: `..` ka matlab ek step upar (parent directory); `~` ka matlab apna home folder (`/home/oracle`); aur `cd -` pichhle folder par wapas le aata hai.",
        "code": [
          4,
          5,
          6,
          7,
          8,
          9
        ],
        "ops": [
          [
            "show",
            "nav"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:/var/log$ cd .."
          ],
          [
            "flow",
            "vlog",
            "var",
            "cd ..",
            {
              "tone": "file",
              "dur": 550
            }
          ],
          [
            "unok",
            "vlog"
          ],
          [
            "val",
            "cwd",
            "/var",
            {
              "tone": "file"
            }
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:/var$ cd ~"
          ],
          [
            "flow",
            "var",
            "ohome",
            "cd ~",
            {
              "tone": "ok",
              "dur": 600
            }
          ],
          [
            "val",
            "prev",
            "/var",
            {
              "tone": "accent"
            }
          ],
          [
            "val",
            "cwd",
            "/home/oracle",
            {
              "tone": "ok"
            }
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ cd -"
          ],
          [
            "flow",
            "ohome",
            "var",
            "cd -",
            {
              "tone": "accent",
              "dur": 600
            }
          ],
          [
            "val",
            "cwd",
            "/var",
            {
              "tone": "accent"
            }
          ],
          [
            "out",
            "term",
            "/var"
          ],
          [
            "ok",
            "root"
          ]
        ],
        "vo": "नेविगेशन के शॉर्टकट्स: डॉट-डॉट का मतलब एक स्टेप ऊपर यानी पेरेंट डायरेक्टरी, टिल्ड का मतलब अपना होम फ़ोल्डर स्लैश होम स्लैश ओरेकल, और सी-डी डैश पिछले फ़ोल्डर पर वापस ले आता है।"
      }
    ],
    "points": [
      "Linux mein koi C:\\ ya D:\\ drive nahi hoti; sab kuch root `/` ke neeche ek hi tree mein rehta hai.",
      "`/etc` = system configurations; `/var/log` = logs; `/home` = users; `/u01` = Oracle apps/data.",
      "`pwd` = current working directory; `cd <path>` = folder change karna.",
      "`cd ..` = ek step peeche; `cd ~` = seedha home folder; `cd -` = pichhla folder toggle."
    ],
    "check": {
      "q": "Agar tum `/var/log/nginx` folder mein ho aur seedha apne home directory `/home/oracle` mein jaana chahte ho, sabse chhota tarika kya hai?",
      "a": [
        "cd ..",
        "cd /",
        "cd ~",
        "cd -"
      ],
      "c": 2,
      "why": "`cd ~` (ya sirf `cd`) user ko seedha uske home directory mein le aata hai."
    },
    "syntax": {
      "code": "pwd\ncd /absolute/path\ncd relative/path\ncd ..\ncd ~\ncd -",
      "parts": [
        [
          "pwd",
          "Print Working Directory (full path dikhao)."
        ],
        [
          "cd /var/log",
          "Absolute path: shuru se `/` se lekar destination tak."
        ],
        [
          "cd ..",
          "Ek step upar (parent folder) jao."
        ],
        [
          "cd ~ ya cd",
          "Apne home folder (`/home/username`) par koodo."
        ],
        [
          "cd -",
          "Pichhle folder aur current folder ke beech toggle karo."
        ]
      ]
    },
    "scenario": "Production incident mein jab web app down hoti hai, engineer sabse pehle `cd /var/log/nginx` par jaa kar access/error logs dekhta hai, phir `cd /u01/app/oracle` par jaa kar database files check karta hai.",
    "tasks": [
      {
        "t": "Pata lagao abhi tumhara current working directory kaunsa hai (`pwd`).",
        "sql": "pwd"
      },
      {
        "t": "`/var/log` directory mein jao aur wahan ka path print karo.",
        "sql": "cd /var/log\npwd"
      },
      {
        "t": "Pehle `/etc` jao, phir wapas apne home folder (`~`) mein aao aur `pwd` dikhao.",
        "sql": "cd /etc\ncd ~\npwd"
      }
    ],
    "mistakes": [
      {
        "bad": "cd /home/oracle/..",
        "err": "/home",
        "why": "`..` parent folder par le jata hai. `/home/oracle/..` ka result `/home` hoga, `/home/oracle` nahi.",
        "fix": "cd ~"
      },
      {
        "bad": "cd var/log",
        "err": "No such file or directory",
        "why": "Agar `/home/oracle` mein ho toh bina aage `/` lagaye `var/log` dhoondhne par error aayega. Absolute path ke liye shuru mein `/` zaroori hai (`/var/log`).",
        "fix": "cd /var/log"
      }
    ],
    "intro": "दुकान का बड़ा अलमीरा सोचो। अलमीरा का सबसे बड़ा दरवाज़ा बराबर फॉरवर्ड-स्लैश, यानी रूट। उसके अंदर अलग-अलग खाने हैं: बिल बुक और पॉलिसी बराबर स्लैश ई-टी-सी, स्टॉक रजिस्टर बराबर स्लैश वार स्लैश लॉग, और हर स्टाफ़ का अपना पर्सनल लॉकर बराबर स्लैश होम स्लैश ओरेकल।"
  },
  {
    "id": "lx-ls",
    "course": "linux",
    "sec": "Shuruaat aur Filesystem",
    "title": "ls ke asli job flags: -la, -lh, -ltr, -i",
    "url": "https://man7.org/linux/man-pages/man1/ls.1.html",
    "meta": "Linux · prod-db01 · bash",
    "summary": "`ls` command ke roz-marra use hone wale flags: hidden files (-a), human sizes (-lh), newest files sabse neeche (-ltr), aur inodes (-i).",
    "simple": "Dukaan ke godown ki inventory list socho. Normal `ls` sirf dabbo ke naam batata hai. `ls -la` chhupe huye dabbe (.bashrc) bhi dikhata hai. Aur `ls -ltr` sabse naya aaya maal sabse aakhri line par dikhata hai taaki turant nazar pade.",
    "words": [
      [
        "ls",
        "List directory contents (files aur folders ki list)."
      ],
      [
        "-a / --all",
        "Hidden files (jo dot `.` se shuru hoti hain) dikhana."
      ],
      [
        "-l",
        "Long listing format: permissions, owner, size, aur date time ke saath."
      ],
      [
        "-h",
        "Human readable sizes: bytes ke bajaye KB, MB, GB mein dikhana."
      ],
      [
        "-ltr",
        "Time sort reverse: sabse nayi modified file sabse aakhri line par aati hai."
      ],
      [
        "-i",
        "Inode number: disk par file ka unique physical index number."
      ]
    ],
    "nodes": [
      [
        "f_ls",
        "chip",
        24,
        24,
        190,
        30,
        "1. ls (Names only)",
        {
          "tone": "muted"
        }
      ],
      [
        "f_la",
        "chip",
        230,
        24,
        220,
        30,
        "2. ls -la (+Hidden & Long)",
        {
          "tone": "accent"
        }
      ],
      [
        "f_lh",
        "chip",
        466,
        24,
        220,
        30,
        "3. ls -lh (Human Sizes)",
        {
          "tone": "ok"
        }
      ],
      [
        "f_ltr",
        "chip",
        702,
        24,
        234,
        30,
        "4. ls -ltr (Newest at Bottom!)",
        {
          "tone": "proc"
        }
      ],
      [
        "ltbl",
        "table",
        24,
        78,
        912,
        185,
        "/home/oracle directory listing",
        {
          "cols": [
            "PERMS",
            "OWNER",
            "GROUP",
            "SIZE",
            "MODIFIED",
            "NAME"
          ],
          "cw": [
            0.18,
            0.13,
            0.13,
            0.12,
            0.18,
            0.26
          ]
        }
      ],
      [
        "term",
        "term",
        24,
        278,
        912,
        232,
        "Terminal · ls in Action"
      ]
    ],
    "code": [
      "# 1. Simple file list (hidden files chhip jaati hain)",
      "ls",
      "# 2. Long listing with all hidden dotfiles",
      "ls -la",
      "# 3. Human-readable file sizes (MB, GB instead of raw bytes)",
      "ls -lh",
      "# 4. Sort by time, newest at bottom (Daily Incident Habit!)",
      "ls -ltr /var/log",
      "# 5. View inode numbers of files",
      "ls -li"
    ],
    "codeTitle": "Bash · prod-db01",
    "steps": [
      {
        "say": "Khaali `ls` chalane par files aur folders ke sirf naam aate hain. Dot se shuru hone wali hidden files (jaise `.bashrc`, `.ssh`) nazar nahi aati.",
        "code": [
          0,
          1
        ],
        "ops": [
          [
            "show",
            "f_ls",
            "ltbl",
            "term"
          ],
          [
            "pulse",
            "f_ls"
          ],
          [
            "rows",
            "ltbl",
            [
              [
                "-",
                "oracle",
                "oinstall",
                "-",
                "-",
                "app/"
              ],
              [
                "-",
                "oracle",
                "oinstall",
                "-",
                "-",
                "notes.txt"
              ],
              [
                "-",
                "oracle",
                "oinstall",
                "-",
                "-",
                "scripts/"
              ],
              [
                "-",
                "oracle",
                "oinstall",
                "-",
                "-",
                "servers.csv"
              ],
              [
                "-",
                "oracle",
                "oinstall",
                "-",
                "-",
                "todo.txt"
              ]
            ]
          ],
          [
            "colhl",
            "ltbl",
            [
              5
            ],
            "accent"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ ls"
          ],
          [
            "out",
            "term",
            "app  employees.csv  notes.txt  releases  scripts  servers.csv  todo.txt"
          ]
        ],
        "vo": "खाली एल-एस चलाने पर फ़ाइल्स और फ़ोल्डर्स के सिर्फ़ नाम आते हैं। डॉट से शुरू होने वाली हिडन फ़ाइल्स, जैसे डॉट बैश-आर-सी और डॉट एस-एस-एच, नज़र नहीं आतीं।"
      },
      {
        "say": "Har Linux professional `ls -la` use karta hai. `-a` se hidden files bhi dikhti hain aur `-l` se poora record: permissions (`drwxr-xr-x`), owner (`oracle`), size aur timestamp.",
        "code": [
          2,
          3
        ],
        "ops": [
          [
            "show",
            "f_la"
          ],
          [
            "pulse",
            "f_la"
          ],
          [
            "rows",
            "ltbl",
            [
              [
                "-rw-r--r--",
                "oracle",
                "oinstall",
                "148",
                "Oct 29 10:00",
                ".bashrc (hidden)"
              ],
              [
                "drwx------",
                "oracle",
                "oinstall",
                "4096",
                "Oct 29 10:00",
                ".ssh/ (hidden)"
              ],
              [
                "-rw-r--r--",
                "oracle",
                "oinstall",
                "340",
                "Oct 29 10:00",
                "notes.txt"
              ],
              [
                "-rw-r--r--",
                "oracle",
                "oinstall",
                "482",
                "Oct 29 10:00",
                "servers.csv"
              ],
              [
                "drwxr-xr-x",
                "oracle",
                "oinstall",
                "4096",
                "Oct 29 10:00",
                "scripts/"
              ]
            ]
          ],
          [
            "mark",
            "ltbl",
            [
              0,
              1
            ],
            "accent"
          ],
          [
            "colhl",
            "ltbl",
            [
              0,
              1,
              5
            ],
            "accent"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ ls -la"
          ],
          [
            "out",
            "term",
            "total 48",
            "drwxr-xr-x 6 oracle oinstall 4096 Oct 29 10:00 .",
            "drwxr-xr-x 4 root   root     4096 Oct 29 08:00 ..",
            "-rw-r--r-- 1 oracle oinstall  148 Oct 29 10:00 .bashrc",
            "-rw-r--r-- 1 oracle oinstall  182 Oct 29 10:00 .bash_profile",
            "drwx------ 2 oracle oinstall 4096 Oct 29 10:00 .ssh",
            "-rw-r--r-- 1 oracle oinstall  340 Oct 29 10:00 notes.txt",
            "-rw-r--r-- 1 oracle oinstall  482 Oct 29 10:00 servers.csv"
          ]
        ],
        "vo": "हर लिनक्स प्रोफ़ेशनल एल-एस डैश एल-ए यूज़ करता है। डैश ए से हिडन फ़ाइल्स भी दिखती हैं और डैश एल से पूरा रिकॉर्ड: परमिशन्स, ओनर, साइज़ और टाइमस्टैम्प।"
      },
      {
        "say": "Raw bytes padhna mushkil hota hai (`4294967296` bytes!). `-h` flag lagane se size 4K, 12M, 4G mein dikhta hai, jise human-readable kehte hain.",
        "code": [
          4,
          5
        ],
        "ops": [
          [
            "show",
            "f_lh"
          ],
          [
            "unmark",
            "ltbl"
          ],
          [
            "colhl",
            "ltbl",
            [
              3
            ],
            "ok"
          ],
          [
            "cell",
            "ltbl",
            0,
            3,
            "148B"
          ],
          [
            "cell",
            "ltbl",
            1,
            3,
            "4.0K"
          ],
          [
            "cell",
            "ltbl",
            2,
            3,
            "340B"
          ],
          [
            "cell",
            "ltbl",
            3,
            3,
            "482B"
          ],
          [
            "cell",
            "ltbl",
            4,
            3,
            "4.0K"
          ],
          [
            "mark",
            "ltbl",
            [
              3
            ],
            "ok"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ ls -lh servers.csv"
          ],
          [
            "out",
            "term",
            "-rw-r--r-- 1 oracle oinstall 482B Oct 29 10:00 servers.csv"
          ]
        ],
        "vo": "रॉ बाइट्स पढ़ना मुश्किल होता है। डैश एच फ़्लैग लगाने से साइज़ फोर के, ट्वेल्व एम, फोर जी में दिखता है, जिसे ह्यूमन-रीडेबल कहते हैं।"
      },
      {
        "say": "Production incident mein sabse kaam aane wala command hai `ls -ltr`. `-t` time se sort karta hai aur `-r` use reverse karta hai, jisse sabse latest change aakhri line par dikhta hai!",
        "code": [
          6,
          7
        ],
        "ops": [
          [
            "show",
            "f_ltr"
          ],
          [
            "label",
            "ltbl",
            "/var/log (ls -ltr · Oldest -> Newest)"
          ],
          [
            "rows",
            "ltbl",
            [
              [
                "-rw-r-----",
                "root",
                "root",
                "2.1K",
                "Oct 29 06:15",
                "syslog"
              ],
              [
                "-rw-r--r--",
                "root",
                "root",
                "1.4K",
                "Oct 29 08:00",
                "auth.log"
              ],
              [
                "drwxr-xr-x",
                "root",
                "root",
                "4.0K",
                "Oct 29 10:14",
                "nginx/"
              ],
              [
                "drwxr-xr-x",
                "root",
                "root",
                "4.0K",
                "Oct 29 10:15",
                "app/ (LATEST!)"
              ]
            ]
          ],
          [
            "colhl",
            "ltbl",
            [
              4,
              5
            ],
            "proc"
          ],
          [
            "mark",
            "ltbl",
            [
              3
            ],
            "ok"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ ls -ltr /var/log"
          ],
          [
            "out",
            "term",
            "-rw-r----- 1 root root  2.1K Oct 29 06:15 syslog",
            "-rw-r--r-- 1 root root  1.4K Oct 29 08:00 auth.log",
            "drwxr-xr-x 2 root root  4.0K Oct 29 10:14 nginx",
            "drwxr-xr-x 2 root root  4.0K Oct 29 10:15 app"
          ],
          [
            "ok",
            "f_ltr"
          ]
        ],
        "vo": "प्रोडक्शन इंसिडेंट में सबसे काम आने वाला कमांड है एल-एस डैश एल-टी-आर। डैश टी टाइम से सॉर्ट करता है और डैश आर उसे रिवर्स करता है, जिससे सबसे लेटेस्ट चेंज आख़िरी लाइन पर दिखता है!"
      }
    ],
    "points": [
      "`ls` = basic listing; `ls -a` = dotfiles (hidden) samet sab dikhao.",
      "`ls -l` = permissions, user, group, size aur timestamp ke saath full detail.",
      "`ls -lh` = file sizes ko KB/MB/GB mein padhne laayak banao.",
      "`ls -ltr` = reverse time sort — incident ke waqt sabse fresh modified files sabse neeche aati hain."
    ],
    "check": {
      "q": "Kisi folder mein hazaaron files hain aur dekhna hai ki pichhle 5 minute mein kaunsi file modify hui. Kaunsa flag sabse tezi se dikhayega?",
      "a": [
        "ls -la",
        "ls -ltr",
        "ls -S",
        "ls -i"
      ],
      "c": 1,
      "why": "`ls -ltr` time se sort karke reverse karta hai, jisse sabse nayi modified files terminal ke sabse neeche aati hain."
    },
    "syntax": {
      "code": "ls -l\nls -la\nls -lh\nls -ltr\nls -li",
      "parts": [
        [
          "-l",
          "Long listing (permissions, owner, size, date)."
        ],
        [
          "-a",
          "All files including hidden dotfiles (`.bashrc`)."
        ],
        [
          "-h",
          "Human-readable sizes (4K, 12M, 2G)."
        ],
        [
          "-t",
          "Time ke hisaab se sort karo (newest first)."
        ],
        [
          "-r",
          "Reverse sort order (purani upar, nayi sabse neeche)."
        ],
        [
          "-i",
          "Inode number dikhao."
        ]
      ]
    },
    "scenario": "Jab application crash hoti hai aur log folder `/var/log/app` mein 500 files hoti hain, DBA `ls -ltr` chala kar ek second mein dekh leta hai ki sabse aakhri log file ya dump file kaunsi generate hui.",
    "tasks": [
      {
        "t": "Home directory mein saari hidden dotfiles samet long listing dikhao (`ls -la`).",
        "sql": "ls -la"
      },
      {
        "t": "Files ki list human-readable size ke saath dikhao (`ls -lh`).",
        "sql": "ls -lh"
      },
      {
        "t": "`/var/log` folder mein newest files sabse neeche dekhne ke liye `ls -ltr` chalao.",
        "sql": "ls -ltr /var/log"
      }
    ],
    "mistakes": [
      {
        "bad": "ls -H",
        "err": "invalid option",
        "why": "Human readable ke liye lowercase `-h` hota hai. Capital `-H` symlink dereference ke liye hota hai.",
        "fix": "ls -lh"
      },
      {
        "bad": "ls -lrt",
        "err": "same command",
        "why": "Flags aage peeche chalte hain (`-ltr` ya `-lrt`), par `-ltr` industry standard habit hai jo bolne mein aasaan hai.",
        "fix": "ls -ltr"
      }
    ],
    "intro": "दुकान के गोडाउन की इन्वेंटरी लिस्ट सोचो। नॉर्मल एल-एस सिर्फ़ डब्बों के नाम बताता है। एल-एस डैश एल-ए छुपे हुए डब्बे, जैसे डॉट बैश-आर-सी, भी दिखाता है। और एल-एस डैश एल-टी-आर सबसे नया आया माल सबसे आख़िरी लाइन पर दिखाता है ताकि तुरंत नज़र पड़े।"
  },
  {
    "id": "lx-files",
    "course": "linux",
    "sec": "Shuruaat aur Filesystem",
    "title": "Files aur Folders: mkdir -p, touch, cp, mv, rm safety",
    "url": "https://man7.org/linux/man-pages/man1/rm.1.html",
    "meta": "Linux · prod-db01 · bash",
    "summary": "Files aur folders banane, copy karne aur delete karne ke rules: nested folders ke liye `mkdir -p`, backup copy ke liye `cp -p`, aur `rm -rf` se bachne ke production safe habits.",
    "simple": "Office mein naya folder file rakhna hai. `mkdir -p` poori file cabinet ka section bana deta hai. Purani policy badalne se pehle Xerox copy nikal ke rakhna = `cp -p config.conf config.conf.bak`. Aur raddi fekna = `rm`.",
    "words": [
      [
        "mkdir -p",
        "Parent directories samet nested folder path ek saath banana."
      ],
      [
        "touch",
        "Khaali nayi file banana ya existing file ka timestamp update karna."
      ],
      [
        "cp -p",
        "File copy karna preserving permissions aur timestamps."
      ],
      [
        "mv",
        "File ko move karna ya uska naam badalna (rename)."
      ],
      [
        "rm -rf",
        "Folder aur uske andar ki saari files zabardasti delete karna (bohot khatarnak!)."
      ],
      [
        ".bak",
        "Config edit karne se pehle backup copy ka standard extension."
      ]
    ],
    "nodes": [
      [
        "dir",
        "region",
        24,
        24,
        300,
        118,
        "mkdir -p (Nested Tree)",
        {
          "tone": "accent",
          "sub": "auto-parents"
        }
      ],
      [
        "b1",
        "box",
        40,
        64,
        76,
        56,
        "backup/",
        {
          "tone": "accent",
          "small": 1
        }
      ],
      [
        "b2",
        "box",
        136,
        64,
        76,
        56,
        "2026/",
        {
          "tone": "accent",
          "small": 1
        }
      ],
      [
        "b3",
        "box",
        232,
        64,
        76,
        56,
        "oct/",
        {
          "tone": "ok",
          "small": 1
        }
      ],
      [
        "chk",
        "doc",
        350,
        38,
        145,
        76,
        "health.check",
        {
          "sub": "0B · touch",
          "tone": "proc"
        }
      ],
      [
        "src",
        "doc",
        525,
        38,
        155,
        76,
        "config.env",
        {
          "sub": "original (600)",
          "tone": "mem"
        }
      ],
      [
        "bak",
        "doc",
        735,
        38,
        175,
        76,
        "config.env.bak",
        {
          "sub": "cp -p (safe backup)",
          "tone": "ok"
        }
      ],
      [
        "rmbox",
        "box",
        24,
        162,
        912,
        64,
        "DANGER ZONE: rm -rf /  (No Recycle Bin in Linux!)",
        {
          "tone": "danger",
          "dash": 1,
          "sub": "Always verify path & backup with cp -p before deleting"
        }
      ],
      [
        "term",
        "term",
        24,
        244,
        912,
        266,
        "Terminal · Safe File Operations"
      ]
    ],
    "code": [
      "# 1. Create nested folders in one command",
      "mkdir -p backup/2026/oct",
      "# 2. Touch creates a new empty file",
      "touch app/health.check",
      "# 3. Always take a .bak copy before editing config files!",
      "cp -p app/config.env app/config.env.bak",
      "# 4. Rename or move a file",
      "mv app/health.check app/health.ok",
      "# 5. Delete specific file safely",
      "rm app/health.ok"
    ],
    "codeTitle": "Bash · prod-db01",
    "steps": [
      {
        "say": "Production mein aksar nested folders banane hote hain, jaise `backup/2026/oct`. Agar bina `-p` ke banaoge toh Linux bolega \"folder nahi mila\". `-p` flag beech ke saare parents khud bana deta hai.",
        "code": [
          0,
          1
        ],
        "ops": [
          [
            "show",
            "dir",
            "b1",
            "term"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ mkdir -p backup/2026/oct"
          ],
          [
            "show",
            "b2"
          ],
          [
            "link",
            "b1",
            "b2",
            {
              "tone": "accent"
            }
          ],
          [
            "show",
            "b3"
          ],
          [
            "link",
            "b2",
            "b3",
            {
              "tone": "ok"
            }
          ],
          [
            "ok",
            "b3"
          ]
        ],
        "vo": "प्रोडक्शन में अक्सर नेस्टेड फ़ोल्डर्स बनाने होते हैं, जैसे बैकअप स्लैश ट्वेंटी-ट्वेंटी-सिक्स स्लैश ऑक्ट। अगर बिना डैश पी के बनाओगे तो लिनक्स बोलेगा फ़ोल्डर नहीं मिला। डैश पी फ़्लैग बीच के सारे पेरेंट्स ख़ुद बना देता है।"
      },
      {
        "say": "`touch` command se turant khaali file ban jaati hai. Agar file pehle se ho, toh uska data nahi chhidta, sirf last modified time abhi ka ho jaata hai.",
        "code": [
          2,
          3
        ],
        "ops": [
          [
            "show",
            "chk"
          ],
          [
            "pulse",
            "chk"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ touch app/health.check"
          ],
          [
            "ok",
            "chk"
          ]
        ],
        "vo": "टच कमांड से तुरंत खाली फ़ाइल बन जाती है। अगर फ़ाइल पहले से हो, तो उसका डेटा नहीं छिड़ता, सिर्फ़ लास्ट मॉडिफ़ाइड टाइम अभी का हो जाता है।"
      },
      {
        "say": "Real Job Rule #1: Production config file ko chhoone se pehle hamesha `cp -p file file.bak` chalao! `-p` flag se original file ki permissions aur timestamp safe rehte hain.",
        "code": [
          4,
          5
        ],
        "ops": [
          [
            "show",
            "src",
            "bak"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ cp -p app/config.env app/config.env.bak"
          ],
          [
            "flow",
            "src",
            "bak",
            "cp -p",
            {
              "tone": "ok",
              "dur": 650
            }
          ],
          [
            "link",
            "src",
            "bak",
            {
              "label": "cp -p",
              "tone": "ok"
            }
          ],
          [
            "ok",
            "bak"
          ]
        ],
        "vo": "रियल जॉब रूल नंबर वन: प्रोडक्शन कॉन्फ़िग फ़ाइल को छूने से पहले हमेशा सी-पी डैश पी फ़ाइल फ़ाइल डॉट बैक चलाओ! डैश पी फ़्लैग से ओरिजिनल फ़ाइल की परमिशन्स और टाइमस्टैम्प सेफ़ रहते हैं।"
      },
      {
        "say": "`mv` file ko doosri jagah bhejta hai ya uska naam badalta hai. `rm` file delete karta hai.",
        "code": [
          6,
          7,
          8,
          9
        ],
        "ops": [
          [
            "term",
            "term",
            "oracle@prod-db01:~$ mv app/health.check app/health.ok"
          ],
          [
            "label",
            "chk",
            "health.ok",
            "renamed via mv"
          ],
          [
            "tone",
            "chk",
            "accent"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ rm app/health.ok"
          ],
          [
            "drop",
            "chk"
          ]
        ],
        "vo": "एम-वी फ़ाइल को दूसरी जगह भेजता है या उसका नाम बदलता है। आर-एम फ़ाइल डिलीट करता है।"
      },
      {
        "say": "Cheshtawani: `rm -rf` bina confirm kiye folder aur uske andar sab kuch mita deta hai. Linux mein koi \"Recycle Bin\" nahi hota! Kabhi bhi `rm -rf /` ya galat space wala path mat chalana.",
        "ops": [
          [
            "show",
            "rmbox"
          ],
          [
            "x",
            "rmbox"
          ],
          [
            "pulse",
            "rmbox"
          ]
        ],
        "vo": "चेतावनी: आर-एम डैश आर-एफ़ बिना कन्फ़र्म किए फ़ोल्डर और उसके अंदर सब कुछ मिटा देता है। लिनक्स में कोई रीसायकल बिन नहीं होता! कभी भी आर-एम डैश आर-एफ़ स्लैश या ग़लत स्पेस वाला पाथ मत चलाना।"
      }
    ],
    "points": [
      "`mkdir -p dir/sub/deep` = parent directories ke saath poora path ek baari mein banao.",
      "`touch file.txt` = khaali file create karo ya timestamp refresh karo.",
      "Production Golden Habit: Config file edit karne se pehle hamesha `cp -p file file.bak` banao.",
      "`mv` = move ya rename; `rm` = delete (Linux mein Undo ya Recycle Bin nahi hota!)."
    ],
    "check": {
      "q": "Production server par `/etc/nginx/nginx.conf` edit karne se pehle sabse pehla safety step kya hona chahiye?",
      "a": [
        "rm -f /etc/nginx/nginx.conf",
        "cp -p /etc/nginx/nginx.conf /etc/nginx/nginx.conf.bak",
        "mv /etc/nginx/nginx.conf /tmp",
        "touch /etc/nginx/nginx.conf"
      ],
      "c": 1,
      "why": "`cp -p config config.bak` chalane se agar naye badlaav mein syntax error ho toh turant purani file restore ki jaa sakti hai."
    },
    "syntax": {
      "code": "mkdir -p path/to/dir\ntouch filename\ncp -p source dest\ncp -r sourcedir destdir\nmv oldname newname\nrm filename\nrm -rf dirname",
      "parts": [
        [
          "mkdir -p",
          "Nested directories banao bina error ke."
        ],
        [
          "touch",
          "Empty file banao."
        ],
        [
          "cp -p",
          "Copy karo preserving permissions aur timestamps."
        ],
        [
          "cp -r",
          "Directory ko recursively copy karo."
        ],
        [
          "mv",
          "Rename karo ya doosri directory mein move karo."
        ],
        [
          "rm -rf",
          "Recursive forced delete (bohot dhyan se use karo)."
        ]
      ]
    },
    "scenario": "Junior engineer ne bina backup liye Nginx config edit ki aur service restart fail ho gayi. Senior engineer ne pucha \"tumhara `.bak` kahan hai?\". Tab se har team member config chhoone se pehle `cp -p app.conf app.conf.bak` banata hai.",
    "tasks": [
      {
        "t": "Nested directory `backup/2026/db` banao ek command mein (`mkdir -p`).",
        "sql": "mkdir -p backup/2026/db"
      },
      {
        "t": "`app/config.env` ka backup copy `app/config.env.bak` banao permissions preserve karte hue (`cp -p`).",
        "sql": "cp -p app/config.env app/config.env.bak"
      },
      {
        "t": "`test.tmp` naam ki khaali file touch karo aur phir use `rm` se delete karo.",
        "sql": "touch test.tmp\nrm test.tmp"
      }
    ],
    "mistakes": [
      {
        "bad": "mkdir a/b/c",
        "err": "No such file or directory",
        "why": "Bina `-p` ke agar parent folders `a` aur `b` pehle se nahi hain toh `mkdir` fail ho jata hai.",
        "fix": "mkdir -p a/b/c"
      },
      {
        "bad": "rm -rf / home/oracle/tmp",
        "err": "disaster space typo",
        "why": "`/` aur `home` ke beech ek space aane se command pehle poore system root `/` ko delete karne lagti hai!",
        "fix": "rm -rf /home/oracle/tmp"
      }
    ],
    "intro": "ऑफ़िस में नया फ़ोल्डर फ़ाइल रखना है। एम-के-डी-आई-आर डैश पी पूरी फ़ाइल कैबिनेट का सेक्शन बना देता है। पुरानी पॉलिसी बदलने से पहले ज़ेरॉक्स कॉपी निकाल के रखना बराबर सी-पी डैश पी कॉन्फ़िग डॉट कॉन्फ़ कॉन्फ़िग डॉट कॉन्फ़ डॉट बैक। और रद्दी फेंकना बराबर आर-एम।"
  },
  {
    "id": "lx-view",
    "course": "linux",
    "sec": "Files Padhna, Dhoondhna aur Links",
    "title": "Badi Files aur Live Logs padhna: cat, less, head, tail -f",
    "url": "https://man7.org/linux/man-pages/man1/tail.1.html",
    "meta": "Linux · prod-db01 · bash",
    "summary": "Production server par log files dekhne ke tools: `cat` se bacho (5GB log par terminal crash!), paging ke liye `less`, shuru ke liye `head`, aur live streaming ke liye `tail -f`.",
    "simple": "Badi kitaab socho. Poori 1000 panno ki kitaab ek second mein hawa mein phenkna = `cat`. Ek-ek panna aaraam se aage peeche padhna = `less`. Pehla chapter dekhna = `head`. Aur abhi live likhi jaa rahi nayi line par nazar rakhna = `tail -f`.",
    "words": [
      [
        "cat",
        "File ka poora content ek jhatke mein screen par chhap dena."
      ],
      [
        "less",
        "Paging viewer: bade logs ko screen-by-screen scroll karke padhna (q se bahar)."
      ],
      [
        "head",
        "File ki shuru ki N lines dikhana (default 10, head -n 20)."
      ],
      [
        "tail",
        "File ki aakhri N lines dikhana (tail -n 50)."
      ],
      [
        "tail -f",
        "Follow mode: nayi log lines aate hi real-time screen par aati hain."
      ],
      [
        "wc -l",
        "Word count line flag: file mein total kitni lines hain ginn na."
      ]
    ],
    "nodes": [
      [
        "log",
        "table",
        24,
        42,
        520,
        172,
        "/var/log/syslog (12 lines)",
        {
          "cols": [
            "#",
            "TIME",
            "SERVICE & MESSAGE"
          ],
          "cw": [
            0.12,
            0.22,
            0.66
          ]
        }
      ],
      [
        "wc",
        "var",
        572,
        42,
        160,
        50,
        "wc -l (Line Count)",
        {
          "v": "?",
          "tone": "accent"
        }
      ],
      [
        "warn",
        "chip",
        748,
        48,
        188,
        30,
        "5GB Log: NO cat!",
        {
          "tone": "danger"
        }
      ],
      [
        "head",
        "proc",
        572,
        108,
        170,
        44,
        "head -n 5",
        {
          "sub": "Top 5 lines",
          "tone": "accent"
        }
      ],
      [
        "tail",
        "proc",
        762,
        108,
        174,
        44,
        "tail -n 5",
        {
          "sub": "Last 5 lines",
          "tone": "danger"
        }
      ],
      [
        "live",
        "box",
        572,
        164,
        364,
        50,
        "tail -f /var/log/nginx/access.log",
        {
          "sub": "Real-time live stream · Ctrl+C to stop",
          "tone": "ok"
        }
      ],
      [
        "term",
        "term",
        24,
        230,
        912,
        280,
        "Terminal · Log Inspection"
      ]
    ],
    "code": [
      "# 1. Count total lines in a log file",
      "wc -l /var/log/syslog",
      "# 2. View first 5 lines (header / boot lines)",
      "head -n 5 /var/log/syslog",
      "# 3. View last 5 lines (most recent errors/events)",
      "tail -n 5 /var/log/syslog",
      "# 4. Stream new logs live in real-time as users hit the app",
      "tail -f /var/log/nginx/access.log"
    ],
    "codeTitle": "Bash · prod-db01",
    "steps": [
      {
        "say": "Production server par log files hazaaron MBs ki hoti hain. Galti se `cat production.log` chala diya toh terminal freeze ho jayega aur CPU 100% ho sakta hai!",
        "ops": [
          [
            "show",
            "log",
            "warn",
            "term"
          ],
          [
            "rows",
            "log",
            [
              [
                "1",
                "06:15:01",
                "CRON: logrotate /etc/logrotate.conf"
              ],
              [
                "2",
                "07:00:12",
                "systemd: Starting Daily apt activities"
              ],
              [
                "5",
                "09:14:55",
                "sshd: Accepted publickey for oracle"
              ],
              [
                "10",
                "12:01:10",
                "kernel: Out of memory: Kill java_worker"
              ],
              [
                "12",
                "12:05:01",
                "systemd: payapi.service Failed (ERROR)"
              ]
            ]
          ],
          [
            "x",
            "warn"
          ],
          [
            "pulse",
            "warn"
          ]
        ],
        "vo": "प्रोडक्शन सर्वर पर लॉग फ़ाइल्स हज़ारों एम-बीज़ की होती हैं। ग़लती से कैट प्रोडक्शन डॉट लॉग चला दिया तो टर्मिनल फ़्रीज़ हो जाएगा और सी-पी-यू हंड्रेड परसेंट हो सकता है!"
      },
      {
        "say": "Pehle dekho file kitni lambi hai. `wc -l /var/log/syslog` se total line count milta hai.",
        "code": [
          0,
          1
        ],
        "ops": [
          [
            "show",
            "wc"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ wc -l /var/log/syslog"
          ],
          [
            "flow",
            "log",
            "wc",
            "count",
            {
              "tone": "accent",
              "dur": 550
            }
          ],
          [
            "val",
            "wc",
            "12 lines",
            {
              "tone": "ok"
            }
          ],
          [
            "out",
            "term",
            "12 /var/log/syslog"
          ]
        ],
        "vo": "पहले देखो फ़ाइल कितनी लंबी है। डब्ल्यू-सी डैश एल स्लैश वार स्लैश लॉग स्लैश सिसलॉग से टोटल लाइन काउंट मिलता है।"
      },
      {
        "say": "File ke shuruaati hisse ko dekhne ke liye `head -n 5` use karo.",
        "code": [
          2,
          3
        ],
        "ops": [
          [
            "show",
            "head"
          ],
          [
            "mark",
            "log",
            [
              0,
              1,
              2
            ],
            "accent"
          ],
          [
            "fade",
            "log",
            [
              3,
              4
            ]
          ],
          [
            "flow",
            "log#0",
            "head",
            "top 5",
            {
              "tone": "accent",
              "dur": 600
            }
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ head -n 5 /var/log/syslog"
          ],
          [
            "out",
            "term",
            "Oct 29 06:15:01 prod-db01 CRON[12044]: (root) CMD (/usr/local/bin/logrotate /etc/logrotate.conf)",
            "Oct 29 07:00:12 prod-db01 systemd[1]: Starting Daily apt download activities...",
            "Oct 29 07:00:18 prod-db01 systemd[1]: apt-daily.service: Deactivated successfully.",
            "Oct 29 08:30:22 prod-db01 kernel: [ 4521.120] e1000e 0000:00:1f.6 eth0: NIC Link is Up 1000 Mbps Full Duplex",
            "Oct 29 09:14:55 prod-db01 sshd[15402]: Accepted publickey for oracle from 10.0.1.25 port 54112 ssh2: ED25519"
          ]
        ],
        "vo": "फ़ाइल के शुरुआती हिस्से को देखने के लिए हेड डैश एन फाइव यूज़ करो।"
      },
      {
        "say": "Sabse zaroori information hamesha aakhri lines mein hoti hai. `tail -n 5` se abhi abhi huye latest events dikhte hain.",
        "code": [
          4,
          5
        ],
        "ops": [
          [
            "show",
            "tail"
          ],
          [
            "unfade",
            "log"
          ],
          [
            "unmark",
            "log"
          ],
          [
            "fade",
            "log",
            [
              0,
              1,
              2
            ]
          ],
          [
            "mark",
            "log",
            [
              3,
              4
            ],
            "danger"
          ],
          [
            "flow",
            "log#4",
            "tail",
            "last 5",
            {
              "tone": "danger",
              "dur": 600
            }
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ tail -n 5 /var/log/syslog"
          ],
          [
            "out",
            "term",
            "Oct 29 11:45:00 prod-db01 systemd[1]: Reloading The NGINX HTTP and reverse proxy server...",
            "Oct 29 11:45:01 prod-db01 systemd[1]: Reloaded The NGINX HTTP and reverse proxy server.",
            "Oct 29 12:01:10 prod-db01 kernel: [14201.550] Out of memory: Kill process 18204 (java_worker) score 720 or sacrifice child",
            "Oct 29 12:05:00 prod-db01 systemd[1]: payapi.service: Main process exited, code=exited, status=1/FAILURE",
            "Oct 29 12:05:01 prod-db01 systemd[1]: payapi.service: Failed with result \"exit-code\", ERROR state logged."
          ]
        ],
        "vo": "सबसे ज़रूरी इन्फ़ॉर्मेशन हमेशा आख़िरी लाइन्स में होती है। टेल डैश एन फाइव से अभी-अभी हुए लेटेस्ट इवेंट्स दिखते हैं।"
      },
      {
        "say": "Jab QA ya customer testing kar raha ho, `tail -f /var/log/nginx/access.log` chala ke screen khol do — har request aate hi terminal par live dikhegi!",
        "code": [
          6,
          7
        ],
        "ops": [
          [
            "show",
            "live"
          ],
          [
            "unfade",
            "log"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ tail -f /var/log/nginx/access.log"
          ],
          [
            "flow",
            "log",
            "live",
            "live follow (-f)",
            {
              "tone": "ok",
              "dur": 650
            }
          ],
          [
            "out",
            "term",
            "10.0.1.12 - - [29/Oct/2026:10:14:01] \"GET /api/orders HTTP/1.1\" 200 1420",
            "203.0.113.9 - - [29/Oct/2026:10:14:05] \"POST /api/checkout HTTP/1.1\" 500 284",
            "-- Following /var/log/nginx/access.log (real-time stream simulation) · Ctrl+C to stop"
          ],
          [
            "ok",
            "live"
          ]
        ],
        "vo": "जब क्यू-ए या कस्टमर टेस्टिंग कर रहा हो, टेल डैश एफ़ स्लैश वार स्लैश लॉग स्लैश इंजन-एक्स स्लैश एक्सेस डॉट लॉग चला के स्क्रीन खोल दो, हर रिक्वेस्ट आते ही टर्मिनल पर लाइव दिखेगी!"
      }
    ],
    "points": [
      "Badi log files par kabhi `cat` mat chalao — terminal aur system slow ho sakta hai.",
      "`head -n 10 file` = shuruaati 10 lines.",
      "`tail -n 20 file` = aakhri 20 lines (sabse taaza events dekhne ke liye).",
      "`tail -f file` = live log streaming (terminal khula rehta hai aur naye events aate rehte hain; Ctrl+C se roko).",
      "`wc -l file` = lines ki ginti."
    ],
    "check": {
      "q": "Testing team bolti hai \"humne abhi button dabaya, dekho server par error aaya kya\". Kaunsi command sabse best hai?",
      "a": [
        "cat /var/log/app/app.log",
        "tail -f /var/log/app/app.log",
        "head /var/log/app/app.log",
        "wc /var/log/app/app.log"
      ],
      "c": 1,
      "why": "`tail -f` log file ko real-time watch karta hai, jaise hi tester button dabayega, aane wala error turant screen par chhap jayega."
    },
    "syntax": {
      "code": "head -n 10 file.log\ntail -n 20 file.log\ntail -f /var/log/app.log\nwc -l file.log\nless file.log",
      "parts": [
        [
          "head -n <N>",
          "Top N lines print karo."
        ],
        [
          "tail -n <N>",
          "Bottom N lines print karo."
        ],
        [
          "tail -f",
          "Follow mode (live append stream)."
        ],
        [
          "wc -l",
          "Total lines count karo."
        ],
        [
          "less",
          "Interactive pager (arrows se scroll karo, `q` se bahar)."
        ]
      ]
    },
    "scenario": "Payment gateway deploy karte waqt DevOps engineer ek window mein `tail -f /var/log/nginx/error.log` aur doosri mein `tail -f /var/log/oracle/alert_FREE.log` chalu rakhta hai taaki pehle hi transaction ka error turant dikh jaye.",
    "tasks": [
      {
        "t": "`/var/log/syslog` file mein total kitni lines hain gino (`wc -l`).",
        "sql": "wc -l /var/log/syslog"
      },
      {
        "t": "`/var/log/syslog` ki pehli 5 lines dikhao (`head -n 5`).",
        "sql": "head -n 5 /var/log/syslog"
      },
      {
        "t": "`/var/log/syslog` ki aakhri 5 lines dikhao (`tail -n 5`).",
        "sql": "tail -n 5 /var/log/syslog"
      }
    ],
    "mistakes": [
      {
        "bad": "tail -F 10 /var/log/syslog",
        "err": "invalid option",
        "why": "Lines batane ke liye `-n 10` hota hai. `-f` follow ke liye hota hai.",
        "fix": "tail -n 10 /var/log/syslog"
      },
      {
        "bad": "cat /var/log/syslog | head -5",
        "err": "useless use of cat",
        "why": "`cat` laga ke pipe karna zaroori nahi hai; `head -n 5 /var/log/syslog` seedha file padhta hai aur 100x fast hai.",
        "fix": "head -n 5 /var/log/syslog"
      }
    ],
    "intro": "बड़ी किताब सोचो। पूरी एक हज़ार पन्नों की किताब एक सेकंड में हवा में फेंकना बराबर कैट। एक-एक पन्ना आराम से आगे-पीछे पढ़ना बराबर लेस। पहला चैप्टर देखना बराबर हेड। और अभी लाइव लिखी जा रही नई लाइन पर नज़र रखना बराबर टेल डैश एफ़।"
  },
  {
    "id": "lx-find",
    "course": "linux",
    "sec": "Files Padhna, Dhoondhna aur Links",
    "title": "find aur which: naam, size, umar aur cleanup",
    "url": "https://man7.org/linux/man-pages/man1/find.1.html",
    "meta": "Linux · prod-db01 · bash",
    "summary": "Server par files khojna aur cleanup karna: `find` ke powerful filters (naam `-name`, size `-size +100M`, umar `-mtime +7`) aur executable binary dhoondhne ke liye `which`.",
    "simple": "Poore godown mein dhoondhna: \"Har woh lamba dabba jiska wazan 50kg se zyada hai aur jo pichhle mahine se pada hai\". `find` poore folder structure ko chhaan kar aisi files ki list deta hai.",
    "words": [
      [
        "find",
        "Filesystem mein conditions ke hisaab se files/directories dhoondhna."
      ],
      [
        "-name / -iname",
        "File ke naam ya wildcard pattern (*.log) se dhoondhna (iname = case-insensitive)."
      ],
      [
        "-type f / d",
        "Sirf regular files (f) ya sirf folders (d) filter karna."
      ],
      [
        "-size +100M",
        "Size filter: 100 Megabyte se badi files pakadna."
      ],
      [
        "-mtime +7",
        "Modification time: 7 din se purani files dhoondhna."
      ],
      [
        "-delete",
        "Dhoondhi hui files ko turant delete karna (pehle bina -delete run karke verify karo!)."
      ],
      [
        "which",
        "Command ka executable binary path batata hai (/usr/bin/nginx)."
      ]
    ],
    "nodes": [
      [
        "wbox",
        "var",
        24,
        36,
        230,
        50,
        "which nginx (Binary Path)",
        {
          "v": "/usr/bin/nginx",
          "tone": "accent"
        }
      ],
      [
        "filter",
        "proc",
        24,
        104,
        230,
        54,
        "find /var/log",
        {
          "sub": "-name · -size · -mtime",
          "tone": "proc"
        }
      ],
      [
        "res",
        "box",
        24,
        174,
        230,
        58,
        "Cleanup Action",
        {
          "sub": "-delete (1.25 GB freed!)",
          "tone": "ok"
        }
      ],
      [
        "ftbl",
        "table",
        278,
        36,
        658,
        196,
        "/var/log file tree scan",
        {
          "cols": [
            "PATH",
            "TYPE",
            "SIZE",
            "AGE",
            "STATUS"
          ],
          "cw": [
            0.38,
            0.12,
            0.14,
            0.14,
            0.22
          ]
        }
      ],
      [
        "term",
        "term",
        24,
        248,
        912,
        262,
        "Terminal · find in Action"
      ]
    ],
    "code": [
      "# 1. Find binary location of a command",
      "which nginx",
      "# 2. Find all log files under /var/log",
      "find /var/log -name \"*.log\"",
      "# 3. Find files bigger than 100 Megabytes",
      "find /var/log -type f -size +100M",
      "# 4. Find temporary files older than 7 days",
      "find /var/log -name \"*.tmp\" -mtime +7",
      "# 5. Delete old temporary files safely",
      "find /var/log/app -name \"*.tmp\" -mtime +7 -delete"
    ],
    "codeTitle": "Bash · prod-db01",
    "steps": [
      {
        "say": "Do alag dhoondhne ke tools hain: `which` batata hai ki koi command (jaise `nginx` ya `python`) kis path se chal rahi hai. Aur `find` poore folder tree ko chhaanta hai.",
        "code": [
          0,
          1
        ],
        "ops": [
          [
            "show",
            "wbox",
            "term"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ which nginx"
          ],
          [
            "pulse",
            "wbox"
          ],
          [
            "ok",
            "wbox"
          ],
          [
            "out",
            "term",
            "/usr/bin/nginx"
          ]
        ],
        "vo": "दो अलग ढूँढने के टूल्स हैं: विच बताता है कि कोई कमांड, जैसे इंजन-एक्स या पाइथन, किस पाथ से चल रही है। और फ़ाइंड पूरे फ़ोल्डर ट्री को छानता है।"
      },
      {
        "say": "Kisi bhi folder mein specific pattern dhoondhne ke liye `find <path> -name \"<pattern>\"` use karte hain. Wildcard pattern ko hamesha quotes mein rakho!",
        "code": [
          2,
          3
        ],
        "ops": [
          [
            "show",
            "ftbl",
            "filter"
          ],
          [
            "rows",
            "ftbl",
            [
              [
                "/var/log/syslog",
                "file",
                "2.1K",
                "1d",
                "Active log"
              ],
              [
                "/var/log/auth.log",
                "file",
                "1.4K",
                "1d",
                "Security log"
              ],
              [
                "/var/log/app/app.log",
                "file",
                "10M",
                "1d",
                "App log"
              ],
              [
                "/var/log/app/old_2025.tmp",
                "file",
                "450M",
                "14d",
                "Stale temp"
              ],
              [
                "/var/log/app/crashdump.tmp",
                "file",
                "800M",
                "10d",
                "Huge dump"
              ]
            ]
          ],
          [
            "mark",
            "ftbl",
            [
              0,
              1,
              2
            ],
            "accent"
          ],
          [
            "fade",
            "ftbl",
            [
              3,
              4
            ]
          ],
          [
            "label",
            "filter",
            "find /var/log",
            "-name \"*.log\""
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ find /var/log -name \"*.log\""
          ],
          [
            "out",
            "term",
            "/var/log/syslog",
            "/var/log/auth.log",
            "/var/log/nginx/access.log",
            "/var/log/nginx/error.log",
            "/var/log/oracle/alert_FREE.log",
            "/var/log/app/app.log"
          ]
        ],
        "vo": "किसी भी फ़ोल्डर में स्पेसिफ़िक पैटर्न ढूँढने के लिए फ़ाइंड पाथ डैश नेम पैटर्न यूज़ करते हैं। वाइल्डकार्ड पैटर्न को हमेशा कोट्स में रखो!"
      },
      {
        "say": "Disk space bachaane ke liye sabse badi files pakadna: `-size +100M` ka matlab 100MB se badi files. `-type f` folders ko chhod kar sirf files dekhta hai.",
        "code": [
          4,
          5
        ],
        "ops": [
          [
            "unfade",
            "ftbl"
          ],
          [
            "unmark",
            "ftbl"
          ],
          [
            "label",
            "filter",
            "find /var/log",
            "-type f -size +100M"
          ],
          [
            "colhl",
            "ftbl",
            [
              2
            ],
            "danger"
          ],
          [
            "fade",
            "ftbl",
            [
              0,
              1,
              2
            ]
          ],
          [
            "mark",
            "ftbl",
            [
              3,
              4
            ],
            "danger"
          ],
          [
            "flow",
            "filter",
            "ftbl",
            "size > 100M",
            {
              "tone": "danger",
              "dur": 600
            }
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ find /var/log -type f -size +100M"
          ],
          [
            "out",
            "term",
            "/var/log/app/old_2025.tmp",
            "/var/log/app/crashdump.tmp"
          ]
        ],
        "vo": "डिस्क स्पेस बचाने के लिए सबसे बड़ी फ़ाइल्स पकड़ना: डैश साइज़ प्लस हंड्रेड एम का मतलब सौ एम-बी से बड़ी फ़ाइल्स। डैश टाइप एफ़ फ़ोल्डर्स को छोड़ कर सिर्फ़ फ़ाइल्स देखता है।"
      },
      {
        "say": "Incident Cleanup Rule: Pehle `find` chala ke files ki list dekho. Jab pakka ho jaye ki yahi delete karni hai, tab aakhir mein `-delete` lagao.",
        "code": [
          6,
          7,
          8,
          9
        ],
        "ops": [
          [
            "show",
            "res"
          ],
          [
            "colhl",
            "ftbl",
            [
              2,
              3
            ],
            "danger"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ find /var/log -name \"*.tmp\" -mtime +7"
          ],
          [
            "out",
            "term",
            "/var/log/app/old_2025.tmp",
            "/var/log/app/crashdump.tmp"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ find /var/log/app -name \"*.tmp\" -mtime +7 -delete"
          ],
          [
            "flow",
            "ftbl",
            "res",
            "-delete",
            {
              "tone": "ok",
              "dur": 600
            }
          ],
          [
            "delrow",
            "ftbl",
            [
              3,
              4
            ]
          ],
          [
            "unfade",
            "ftbl"
          ],
          [
            "colhl",
            "ftbl",
            []
          ],
          [
            "ok",
            "res"
          ]
        ],
        "vo": "इंसिडेंट क्लीनअप रूल: पहले फ़ाइंड चला के फ़ाइल्स की लिस्ट देखो। जब पक्का हो जाए कि यही डिलीट करनी हैं, तब आख़िर में डैश डिलीट लगाओ।"
      }
    ],
    "points": [
      "`which cmd` = command ka executable path (`/usr/bin/nginx`).",
      "`find /path -name \"*.log\"` = naam se search karo (pattern quotes mein rakho).",
      "`find /path -type f -size +100M` = 100MB se badi files dhoondho.",
      "`find /path -mtime +7` = 7 din se purani files.",
      "Cleanup rule: pehle bina `-delete` ke list verify karo, phir delete karo."
    ],
    "check": {
      "q": "`/var/log` ke andar 50MB se badi sabhi `.log` files dhoondhni hain. Kaunsi command sahi hai?",
      "a": [
        "find /var/log -name *.log -size 50M",
        "find /var/log -name \"*.log\" -type f -size +50M",
        "which /var/log \"*.log\" +50M",
        "grep -r \"50M\" /var/log"
      ],
      "c": 1,
      "why": "Quotes `\"*.log\"` shell expansion se bachate hain, `-type f` sirf files dekhta hai aur `+50M` 50MB se zyada size match karta hai."
    },
    "syntax": {
      "code": "find [path] [filters] [action]\nfind /var/log -name \"*.log\"\nfind /var/log -type f -size +100M\nfind /var/log -mtime +30\nfind /var/log -name \"*.tmp\" -delete",
      "parts": [
        [
          "path",
          "Kahan se dhoondhna shuru karein (`.` ya `/var/log`)."
        ],
        [
          "-name \"*.log\"",
          "Filename wildcard match (quotes mein)."
        ],
        [
          "-type f",
          "Sirf regular files (d = directory)."
        ],
        [
          "-size +100M",
          "Size filter (+ matlab zyada, - matlab kam)."
        ],
        [
          "-mtime +7",
          "Modified time: 7 din se zyada purana."
        ],
        [
          "-delete",
          "Directly matched files ko remove karo."
        ]
      ]
    },
    "scenario": "Production server par disk usage 95% pahunch gaya. DBA ne `find /u01 -type f -size +1G` chala ke dekha ki ek purana uncompressed database dump 18GB space khaye baitha tha, jise compress karne par 15GB space turant free ho gayi.",
    "tasks": [
      {
        "t": "Check karo `nginx` binary kahan installed hai (`which nginx`).",
        "sql": "which nginx"
      },
      {
        "t": "`/var/log` folder ke andar saari `.log` files dhoondho (`find`).",
        "sql": "find /var/log -name \"*.log\""
      },
      {
        "t": "`/var/log` ke andar 100MB se badi files dhoondho (`-size +100M`).",
        "sql": "find /var/log -type f -size +100M"
      }
    ],
    "mistakes": [
      {
        "bad": "find /var/log -name *.log",
        "err": "find: paths must precede expression",
        "why": "Agar quotes nahi lagaye (`\"*.log\"`), toh current directory mein match milte hi bash wildcard expand kar deta hai aur find syntax toot jata hai.",
        "fix": "find /var/log -name \"*.log\""
      },
      {
        "bad": "find / -size +100",
        "err": "missing unit",
        "why": "Size ke aage unit batana zaroori hai (`k` = KB, `M` = MB, `G` = GB). Sirf `100` ka matlab 512-byte blocks hota hai.",
        "fix": "find / -size +100M"
      }
    ],
    "intro": "पूरे गोडाउन में ढूँढना: हर वो लंबा डब्बा जिसका वज़न पचास किलो से ज़्यादा है और जो पिछले महीने से पड़ा है। फ़ाइंड पूरे फ़ोल्डर स्ट्रक्चर को छान कर ऐसी फ़ाइल्स की लिस्ट देता है।"
  },
  {
    "id": "lx-links",
    "course": "linux",
    "sec": "Files Padhna, Dhoondhna aur Links",
    "title": "Inodes, Hard Links aur Soft Links (ln -s)",
    "url": "https://man7.org/linux/man-pages/man1/ln.1.html",
    "meta": "Linux · prod-db01 · bash",
    "summary": "Inodes, Hard Links aur Symbolic Links (`ln -s`) ka farq samjho, aur dekho kaise real production jobs mein Zero-Downtime Releases `current -> v1.1` symlink se switch hoti hain.",
    "simple": "Ghar ka pata socho. Inode = asli zameen ka plot number. Hard link = ek hi ghar ke do alag naam (dono seedha zameen ko point karte hain, ek nameboard hatane se ghar nahi girta). Soft/Symlink = ek signpost jis par likha hai \"plot number 42 par jao\" (agar zameen bik gayi, signpost tut jata hai - dangling link).",
    "words": [
      [
        "Inode",
        "Disk par file ka metadata record (size, owner, disk blocks ka address; filename nahi hota!)."
      ],
      [
        "Hard Link",
        "Ek hi inode ka doosra naam; original file delete hone par bhi data zinda rehta hai."
      ],
      [
        "Symbolic Link (Soft Link)",
        "Shortcut file jo doosri file ka path store karti hai (`ln -s target linkname`)."
      ],
      [
        "Dangling Link",
        "Broken symlink jiska target file delete ho chuka ho."
      ],
      [
        "Zero-Downtime Deployment",
        "Symlink switch karke bina app band kiye naya version live karna."
      ]
    ],
    "nodes": [
      [
        "r_hard",
        "region",
        24,
        24,
        430,
        190,
        "Hard Links (Same Inode)",
        {
          "tone": "accent",
          "sub": "ln file hardlink"
        }
      ],
      [
        "n1",
        "doc",
        44,
        66,
        145,
        52,
        "notes.txt",
        {
          "sub": "Dir Entry #1",
          "tone": "file"
        }
      ],
      [
        "n2",
        "doc",
        44,
        136,
        145,
        52,
        "notes_hard.txt",
        {
          "sub": "Dir Entry #2",
          "tone": "accent"
        }
      ],
      [
        "inode",
        "disk",
        270,
        68,
        150,
        86,
        "Inode #101",
        {
          "sub": "340B · Links: 1",
          "inside": "Data Blocks",
          "tone": "accent",
          "level": 0.6
        }
      ],
      [
        "r_soft",
        "region",
        480,
        24,
        456,
        190,
        "Soft Link / Symlink (Zero-Downtime)",
        {
          "tone": "proc",
          "sub": "ln -sfn target link"
        }
      ],
      [
        "sym",
        "proc",
        504,
        92,
        175,
        54,
        "releases/current",
        {
          "sub": "lrwxrwxrwx (Symlink)",
          "tone": "proc"
        }
      ],
      [
        "f1",
        "box",
        740,
        56,
        172,
        54,
        "releases/app-v1.0",
        {
          "sub": "Previous Stable",
          "tone": "muted"
        }
      ],
      [
        "f2",
        "box",
        740,
        134,
        172,
        54,
        "releases/app-v1.1",
        {
          "sub": "New Release",
          "tone": "ok"
        }
      ],
      [
        "term",
        "term",
        24,
        230,
        912,
        280,
        "Terminal · ln & ln -s in Production"
      ]
    ],
    "code": [
      "# 1. View inode number of notes.txt",
      "ls -li notes.txt",
      "# 2. Create a hard link (shares same inode)",
      "ln notes.txt notes_hard.txt",
      "ls -li notes.txt notes_hard.txt",
      "# 3. Create a symbolic (soft) link to directory or file",
      "ln -s /home/oracle/releases/app-v1.1 releases/current",
      "# 4. View symlink arrow target",
      "ls -l releases/current",
      "# 5. Atomic zero-downtime release switch (-sfn)",
      "ln -sfn /home/oracle/releases/app-v1.0 releases/current"
    ],
    "codeTitle": "Bash · prod-db01",
    "steps": [
      {
        "say": "Linux mein file ka naam disk blocks par nahi hota! Data Inode mein rehta hai, aur file ka naam sirf ek label hai jo us inode ko point karta hai.",
        "ops": [
          [
            "show",
            "r_hard",
            "n1",
            "inode"
          ],
          [
            "link",
            "n1",
            "inode",
            {
              "label": "Inode #101",
              "tone": "accent"
            }
          ],
          [
            "pulse",
            "inode"
          ]
        ],
        "vo": "लिनक्स में फ़ाइल का नाम डिस्क ब्लॉक्स पर नहीं होता! डेटा आई-नोड में रहता है, और फ़ाइल का नाम सिर्फ़ एक लेबल है जो उस आई-नोड को पॉइंट करता है।"
      },
      {
        "say": "Hard Link banane par ek hi Inode ko doosra naam mil jata hai (`ln file hardlink`). Dono ka inode number bilkul same hota hai (`ls -li`).",
        "code": [
          0,
          1,
          2,
          3
        ],
        "ops": [
          [
            "show",
            "term"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ ls -li notes.txt"
          ],
          [
            "out",
            "term",
            "101 -rw-r--r-- 1 oracle oinstall 340 Oct 29 10:00 notes.txt"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ ln notes.txt notes_hard.txt"
          ],
          [
            "show",
            "n2"
          ],
          [
            "link",
            "n2",
            "inode",
            {
              "label": "Inode #101",
              "tone": "ok"
            }
          ],
          [
            "flow",
            "n2",
            "inode",
            "link +1",
            {
              "tone": "ok",
              "dur": 600
            }
          ],
          [
            "sub",
            "inode",
            "340B · Links: 2"
          ],
          [
            "ok",
            "inode"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ ls -li notes.txt notes_hard.txt"
          ],
          [
            "out",
            "term",
            "101 -rw-r--r-- 2 oracle oinstall 340 Oct 29 10:00 notes.txt",
            "101 -rw-r--r-- 2 oracle oinstall 340 Oct 29 10:00 notes_hard.txt"
          ]
        ],
        "vo": "हार्ड लिंक बनाने पर एक ही आई-नोड को दूसरा नाम मिल जाता है, एल-एन फ़ाइल हार्डलिंक। दोनों का आई-नोड नंबर बिल्कुल सेम होता है।"
      },
      {
        "say": "Symbolic Link (Soft Link) Windows ke shortcut jaisa hota hai (`ln -s target linkname`). Yeh ek chhoti file hoti hai jo target ka path store karti hai.",
        "code": [
          4,
          5,
          6,
          7
        ],
        "ops": [
          [
            "show",
            "r_soft",
            "sym",
            "f1",
            "f2"
          ],
          [
            "link",
            "sym",
            "f2",
            {
              "label": "points to v1.1",
              "tone": "ok"
            }
          ],
          [
            "flow",
            "sym",
            "f2",
            "active",
            {
              "tone": "ok",
              "dur": 600
            }
          ],
          [
            "ok",
            "f2"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ ls -l releases/current"
          ],
          [
            "out",
            "term",
            "lrwxrwxrwx 1 oracle oinstall 28 Oct 29 10:00 releases/current -> /home/oracle/releases/app-v1.1"
          ]
        ],
        "vo": "सिम्बॉलिक लिंक, यानी सॉफ़्ट लिंक, विंडोज़ के शॉर्टकट जैसा होता है, एल-एन डैश एस टार्गेट लिंकनेम। ये एक छोटी फ़ाइल होती है जो टार्गेट का पाथ स्टोर करती है।"
      },
      {
        "say": "Real Job Superpower: Zero-Downtime Deployment! Naya code `releases/app-v1.1` mein upload karo, aur `ln -sfn` se 1 millisecond mein `current` symlink badal do. Rollback karna ho toh turant `app-v1.0` par wapas link point kar do!",
        "code": [
          8,
          9
        ],
        "ops": [
          [
            "unlink",
            "sym",
            "f2"
          ],
          [
            "unok",
            "f2"
          ],
          [
            "dim",
            "f2"
          ],
          [
            "tone",
            "f1",
            "accent"
          ],
          [
            "link",
            "sym",
            "f1",
            {
              "label": "rollback -> v1.0",
              "tone": "accent"
            }
          ],
          [
            "flow",
            "sym",
            "f1",
            "instant switch",
            {
              "tone": "accent",
              "dur": 600
            }
          ],
          [
            "ok",
            "f1"
          ],
          [
            "ok",
            "sym"
          ]
        ],
        "vo": "रियल जॉब सुपरपावर: ज़ीरो-डाउनटाइम डिप्लॉयमेंट! नया कोड रिलीज़ेस स्लैश ऐप वी-वन-पॉइंट-वन में अपलोड करो, और एल-एन डैश एस-एफ़-एन से एक मिलीसेकंड में करंट सिमलिंक बदल दो। रोलबैक करना हो तो तुरंत ऐप वी-वन-पॉइंट-ज़ीरो पर वापस लिंक पॉइंट कर दो!"
      }
    ],
    "points": [
      "Inode file ka physical identity card hai; `ls -i` se inode number dikhta hai.",
      "Hard link = same inode ka doosra naam (sirf same filesystem par chalta hai).",
      "Soft link (`ln -s`) = path pointer shortcut (directories aur cross-disks bhi chalta hai).",
      "Production release pattern: `ln -sfn new_release current` se bina server roke version update aur instant rollback hota hai."
    ],
    "check": {
      "q": "Soft link aur Hard link mein sabse bada farq kya hai jab original file delete ho jaye?",
      "a": [
        "Hard link toot jata hai, soft link chalta rehta hai",
        "Soft link toot jata hai (dangling), hard link ka data bacha rehta hai",
        "Dono files delete ho jaati hain",
        "Linux permission error de deta hai"
      ],
      "c": 1,
      "why": "Soft link sirf path store karta hai, isliye target delete hone par broken (dangling) ban jata hai. Hard link seedha inode point karta hai, isliye jab tak ek bhi hard link bacha hai, data disk par rehta hai."
    },
    "syntax": {
      "code": "ln target hardlink\nln -s /path/to/target symlink_name\nln -sfn /new/target symlink_name\nls -l symlink_name",
      "parts": [
        [
          "ln target link",
          "Hard link banao (same inode)."
        ],
        [
          "ln -s target link",
          "Symbolic/Soft link banao."
        ],
        [
          "-f",
          "Purana link ho toh overwrite karo."
        ],
        [
          "-n",
          "Target agar directory ho toh use normal file treat karke link badlo (atomic switch)."
        ]
      ]
    },
    "scenario": "Nginx web server hamesha `/var/www/current` folder ko serve karta hai. Har deployment par CI/CD pipeline nayi release `releases/build_52` banati hai aur aakhir mein `ln -sfn /var/www/releases/build_52 /var/www/current` chalati hai. Ek second ka bhi downtime nahi hota.",
    "tasks": [
      {
        "t": "Check karo `releases/current` symlink kis folder ko point kar raha hai (`ls -l`).",
        "sql": "ls -l releases/current"
      },
      {
        "t": "`notes.txt` file ka inode number verify karo (`ls -li notes.txt`).",
        "sql": "ls -li notes.txt"
      },
      {
        "t": "`notes.txt` ka ek hard link `notes_backup.link` banao aur dono ka inode check karo.",
        "sql": "ln notes.txt notes_backup.link\nls -li notes.txt notes_backup.link"
      }
    ],
    "mistakes": [
      {
        "bad": "ln /home/oracle/app mylink",
        "err": "hard link not allowed for directory",
        "why": "Linux directories par hard link allow nahi karta (filesystem loops se bachne ke liye). Folders ke liye hamesha `-s` (soft link) use karo.",
        "fix": "ln -s /home/oracle/app mylink"
      },
      {
        "bad": "ln -s relative_path/target",
        "err": "broken symlink",
        "why": "Symlink banate waqt agar target ka relative path galat ho toh link toot jata hai. Hamesha absolute path (`/home/oracle/...`) use karna sabse safe hai.",
        "fix": "ln -s /home/oracle/releases/app-v1.1 releases/current"
      }
    ],
    "intro": "घर का पता सोचो। आई-नोड बराबर असली ज़मीन का प्लॉट नंबर। हार्ड लिंक बराबर एक ही घर के दो अलग नाम, दोनों सीधा ज़मीन को पॉइंट करते हैं, एक नेमबोर्ड हटाने से घर नहीं गिरता। सॉफ़्ट या सिमलिंक बराबर एक साइनपोस्ट जिस पर लिखा है प्लॉट नंबर फोर्टी-टू पर जाओ, अगर ज़मीन बिक गई तो साइनपोस्ट टूट जाता है।"
  },
  {
    "id": "lx-vim",
    "course": "linux",
    "sec": "Files Padhna, Dhoondhna aur Links",
    "title": "vi / vim Survival Guide: Server par config edit karna",
    "url": "https://www.vim.org/docs.php",
    "meta": "Linux · prod-db01 · bash",
    "summary": "Production server par terminal text editor `vi`/`vim` se bachein nahi, master karein: 3 modes (Normal, Insert, Command), save karna `:wq`, exit `:q!`, aur non-interactive scripting.",
    "simple": "Pencil aur eraser ka case socho. Normal mode = reading & navigation. `i` dabaya toh pencil haath mein aa gayi (Insert mode - likh sakte ho). `Esc` dabaya toh pencil wapas pocket mein. Phir `:wq` likha toh copy band aur register almirah mein save!",
    "words": [
      [
        "vi / vim",
        "Linux ka standard command-line text editor jo har server par pehle se maujood hota hai."
      ],
      [
        "Normal Mode",
        "Default mode: navigation, search, delete (dd), copy (yy)."
      ],
      [
        "Insert Mode (i)",
        "Text type karne ka mode; aane ke liye `i` dabao, nikalne ke liye `Esc`."
      ],
      [
        "Command Mode (:)",
        "Save aur exit karne ka mode (`:wq`, `:q!`, `:set nu`)."
      ],
      [
        ":wq",
        "Write and Quit (save karke bahar niklo)."
      ],
      [
        ":q!",
        "Quit without saving (bina save kiye zabardasti bahar niklo)."
      ],
      [
        "dd",
        "Poori current line delete (cut) karna."
      ]
    ],
    "nodes": [
      [
        "vst",
        "stages",
        24,
        34,
        912,
        36,
        "VI / VIM WORKFLOW CYCLE",
        {
          "items": [
            "1. Normal Mode",
            "2. Insert Mode (i)",
            "3. Esc -> Normal",
            "4. Save & Quit (:wq)"
          ],
          "tone": "accent",
          "at": 0
        }
      ],
      [
        "norm",
        "box",
        24,
        92,
        260,
        82,
        "Normal Mode (Default)",
        {
          "sub": "Arrows · dd (delete) · u (undo) · /find",
          "tone": "accent"
        }
      ],
      [
        "ins",
        "box",
        350,
        92,
        260,
        82,
        "Insert Mode (Press i)",
        {
          "sub": "Type & edit config text freely",
          "tone": "ok"
        }
      ],
      [
        "cmd",
        "box",
        676,
        92,
        260,
        82,
        "Command Mode (Type :)",
        {
          "sub": ":wq (Save & Exit) · :q! (Abort)",
          "tone": "proc"
        }
      ],
      [
        "stbar",
        "chip",
        24,
        188,
        912,
        30,
        "STATUS BAR: \"app/config.env\" [Normal Mode]",
        {
          "tone": "accent"
        }
      ],
      [
        "term",
        "term",
        24,
        232,
        912,
        278,
        "Terminal · vi Editor Simulation"
      ]
    ],
    "code": [
      "# 1. Open a file in vi editor",
      "vi app/config.env",
      "# 2. In Normal Mode: Press \"i\" to enter Insert Mode",
      "# Type your changes: PORT=9090",
      "# 3. Press \"Esc\" to return to Normal Mode",
      "# 4. Save and exit:",
      "# Type :wq and press Enter",
      "# 5. If you made a mistake and want to exit without saving:",
      "# Type :q! and press Enter"
    ],
    "codeTitle": "Bash · prod-db01",
    "steps": [
      {
        "say": "Server par VS Code ya Notepad nahi hota. Har Linux admin aur DBA ko `vi` aana zaroori hai. Iske 3 modes hote hain: Normal, Insert, aur Command mode.",
        "ops": [
          [
            "show",
            "vst",
            "norm",
            "ins",
            "cmd",
            "stbar",
            "term"
          ],
          [
            "at",
            "vst",
            0
          ],
          [
            "dim",
            "ins",
            "cmd"
          ],
          [
            "pulse",
            "norm"
          ]
        ],
        "vo": "सर्वर पर वी-एस कोड या नोटपैड नहीं होता। हर लिनक्स एडमिन और डी-बी-ए को वी-आई आना ज़रूरी है। इसके तीन मोड्स होते हैं: नॉर्मल, इन्सर्ट, और कमांड मोड।"
      },
      {
        "say": "Jaise hi file kholte ho, tum Normal Mode mein hote ho. Yahan seedha type nahi kar sakte. Likhne ke liye keyboard par `i` dabao — neeche `-- INSERT --` likha aayega.",
        "code": [
          0,
          1,
          2,
          3
        ],
        "ops": [
          [
            "at",
            "vst",
            1
          ],
          [
            "undim",
            "ins"
          ],
          [
            "dim",
            "norm"
          ],
          [
            "link",
            "norm",
            "ins",
            {
              "label": "press i",
              "tone": "ok"
            }
          ],
          [
            "flow",
            "norm",
            "ins",
            "i",
            {
              "tone": "ok",
              "dur": 550
            }
          ],
          [
            "label",
            "stbar",
            "STATUS BAR: -- INSERT -- (Typing enabled)"
          ],
          [
            "tone",
            "stbar",
            "ok"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ vi app/config.env"
          ],
          [
            "out",
            "term",
            "APP_ENV=production",
            "PORT=8080",
            "DB_HOST=127.0.0.1",
            "-- INSERT --"
          ]
        ],
        "vo": "जैसे ही फ़ाइल खोलते हो, तुम नॉर्मल मोड में होते हो। यहाँ सीधा टाइप नहीं कर सकते। लिखने के लिए कीबोर्ड पर आई दबाओ, नीचे इन्सर्ट लिखा आएगा।"
      },
      {
        "say": "Likhne ke baad hamesha `Esc` button dabao taaki wapas Normal Mode mein aa sako. Yahan `dd` dabane se poori line delete hoti hai aur `u` dabane se Undo hota hai.",
        "code": [
          4
        ],
        "ops": [
          [
            "at",
            "vst",
            2
          ],
          [
            "undim",
            "norm"
          ],
          [
            "dim",
            "ins"
          ],
          [
            "link",
            "ins",
            "norm",
            {
              "label": "press Esc",
              "tone": "accent",
              "bend": -32
            }
          ],
          [
            "flow",
            "ins",
            "norm",
            "Esc",
            {
              "tone": "accent",
              "bend": -32,
              "dur": 550
            }
          ],
          [
            "label",
            "stbar",
            "STATUS BAR: Normal Mode (dd = delete line, u = undo)"
          ],
          [
            "tone",
            "stbar",
            "accent"
          ],
          [
            "pulse",
            "norm"
          ]
        ],
        "vo": "लिखने के बाद हमेशा एस्केप बटन दबाओ ताकि वापस नॉर्मल मोड में आ सको। यहाँ डी-डी दबाने से पूरी लाइन डिलीट होती है और यू दबाने से अनडू होता है।"
      },
      {
        "say": "Sabse mashhoor sawaal: \"vi se bahar kaise niklein?\". `:` dabao, phir `wq` likh kar Enter dabao (Write and Quit). Agar galti ho gayi aur bina save kiye nikalna hai toh `:q!` dabao!",
        "code": [
          5,
          6,
          7,
          8
        ],
        "ops": [
          [
            "at",
            "vst",
            3
          ],
          [
            "undim",
            "cmd"
          ],
          [
            "link",
            "norm",
            "cmd",
            {
              "label": "type :wq",
              "tone": "proc",
              "bend": 28
            }
          ],
          [
            "flow",
            "norm",
            "cmd",
            ":wq",
            {
              "tone": "proc",
              "bend": 28,
              "dur": 600
            }
          ],
          [
            "term",
            "term",
            ":wq"
          ],
          [
            "out",
            "term",
            "\"app/config.env\" 6L, 114B written"
          ],
          [
            "label",
            "stbar",
            "SAVED: \"app/config.env\" 6L, 114B written"
          ],
          [
            "tone",
            "stbar",
            "ok"
          ],
          [
            "ok",
            "cmd"
          ]
        ],
        "vo": "सबसे मशहूर सवाल: वी-आई से बाहर कैसे निकलें? कोलन दबाओ, फिर डब्ल्यू-क्यू लिख कर एंटर दबाओ, यानी राइट एंड क्विट। अगर ग़लती हो गई और बिना सेव किए निकलना है तो कोलन क्यू एक्सक्लेमेशन दबाओ!"
      }
    ],
    "points": [
      "`vi` ke 3 modes: Normal (reading/commands), Insert (`i` se type karo), Command (`:` se save/quit).",
      "Likhne ke liye: `i` dabao → text type karo → `Esc` dabao.",
      "Save and Exit: `:wq` aur Enter.",
      "Bina save kiye bahar nikalna: `:q!` aur Enter.",
      "Helpful keys: `dd` = line delete, `u` = undo, `/pattern` = search."
    ],
    "check": {
      "q": "Tumne vi mein ek configuration file kholi, kuch galat type ho gaya aur tum chahte ho ki bina koi change save huye turant bahar nikal jao. Kya type karoge?",
      "a": [
        ":w",
        ":wq",
        ":q!",
        ":exit"
      ],
      "c": 2,
      "why": "`:q!` (Quit with exclamation mark) kisi bhi badlaav ko save kiye bina zabardasti editor band kar deta hai."
    },
    "syntax": {
      "code": "vi filename\ni          # Insert mode\nEsc        # Normal mode\n:wq        # Save and quit\n:q!        # Quit without save\n/word      # Search word\ndd         # Delete current line\nu          # Undo",
      "parts": [
        [
          "vi file",
          "File ko editor mein kholo."
        ],
        [
          "i",
          "Insert mode: text likhna shuru karo."
        ],
        [
          "Esc",
          "Normal mode par wapas aao."
        ],
        [
          ":wq",
          "Write and quit."
        ],
        [
          ":q!",
          "Force quit discarding changes."
        ],
        [
          "dd",
          "Delete current line."
        ]
      ]
    },
    "scenario": "Database start karte waqt `init.ora` parameter file mein spelling mistake ho gayi aur Oracle start fail ho gaya. DBA ne `vi init.ora` khola, `/pga_aggregate` search kiya, parameter sahi karke `:wq` kiya aur instance 10 second mein start ho gaya.",
    "tasks": [
      {
        "t": "`app/config.env` file ka content terminal par verify karo (`cat`).",
        "sql": "cat app/config.env"
      },
      {
        "t": "Search karo config file mein `DB_PORT` kaunsa hai (`grep`).",
        "sql": "grep \"DB_PORT\" app/config.env"
      },
      {
        "t": "Config file ke aakhir mein nayi setting `METRICS_ENABLED=true` append karo (`echo >>`).",
        "sql": "echo \"METRICS_ENABLED=true\" >> app/config.env\ncat app/config.env"
      }
    ],
    "mistakes": [
      {
        "bad": "vi file (typing directly without pressing i)",
        "err": "beep / random command trigger",
        "why": "Normal mode mein letters commands hoti hain (jaise d = delete, r = replace). Pehle `i` dabana zaroori hai.",
        "fix": "Press i before typing"
      },
      {
        "bad": ":q on modified file",
        "err": "E37: No write since last change (add ! to override)",
        "why": "Agar file mein changes kiye hain toh akela `:q` rok deta hai. Save ke liye `:wq` ya discard ke liye `:q!` chahiye.",
        "fix": ":wq  or  :q!"
      }
    ],
    "intro": "पेंसिल और इरेज़र का केस सोचो। नॉर्मल मोड बराबर रीडिंग और नेविगेशन। आई दबाया तो पेंसिल हाथ में आ गई, यानी इन्सर्ट मोड जहाँ लिख सकते हो। एस्केप दबाया तो पेंसिल वापस पॉकेट में। फिर कोलन डब्ल्यू-क्यू लिखा तो कॉपी बंद और रजिस्टर अलमीरा में सेव!"
  },
  {
    "id": "lx-redir",
    "course": "linux",
    "sec": "Pipes, Redirection aur Log Analysis",
    "title": "Streams aur Redirection: >, >>, 2>, 2>&1, /dev/null",
    "url": "https://www.gnu.org/software/bash/manual/html_node/Redirections.html",
    "meta": "Linux · prod-db01 · bash",
    "summary": "Standard streams samjho: `stdin` (0), `stdout` (1), aur `stderr` (2). Overwrite `>` vs append `>>`, errors ko alag log mein bhejna `2>`, dono ek saath `2>&1`, aur garbage dump `/dev/null`.",
    "simple": "Paani ke 3 pipes socho. Pipe 1 (safed paani) = normal output (stdout). Pipe 2 (ganda paani) = error alerts (stderr). `>` naye bartan mein bhejta hai (purana fek kar). `>>` usi bartan mein jodta rehta hai. Aur `/dev/null` = naali jahan jo gira gayab.",
    "words": [
      [
        "stdin (0)",
        "Standard input: keyboard ya file se aane wala data."
      ],
      [
        "stdout (1)",
        "Standard output: successful command ka normal result."
      ],
      [
        "stderr (2)",
        "Standard error: error messages jo screen par aate hain."
      ],
      [
        ">",
        "Overwrite redirection: file ka purana data mita kar naya likhta hai."
      ],
      [
        ">>",
        "Append redirection: purana data bacha kar aakhir mein nayi lines jodta hai."
      ],
      [
        "2>&1",
        "Standard error (2) ko standard output (1) ke saath ek hi file mein jod dena."
      ],
      [
        "/dev/null",
        "Linux ka digital black hole (garbage disposal) jahan bheja gaya output gayab ho jata hai."
      ]
    ],
    "nodes": [
      [
        "stdin",
        "chip",
        24,
        92,
        110,
        30,
        "0: stdin",
        {
          "tone": "muted"
        }
      ],
      [
        "cmd",
        "proc",
        164,
        72,
        165,
        68,
        "Command / Job",
        {
          "sub": "ls, backup_db.sh",
          "tone": "accent"
        }
      ],
      [
        "fd1",
        "proc",
        376,
        36,
        150,
        44,
        "1: stdout",
        {
          "sub": "Normal output",
          "tone": "ok"
        }
      ],
      [
        "fd2",
        "proc",
        376,
        128,
        150,
        44,
        "2: stderr",
        {
          "sub": "Error stream",
          "tone": "danger"
        }
      ],
      [
        "outf",
        "doc",
        590,
        26,
        165,
        66,
        "app/test.env",
        {
          "sub": "> overwrite / >> append",
          "tone": "ok"
        }
      ],
      [
        "errf",
        "doc",
        590,
        118,
        165,
        66,
        "error.log",
        {
          "sub": "2> error capture",
          "tone": "danger"
        }
      ],
      [
        "null",
        "disk",
        790,
        68,
        136,
        72,
        "/dev/null",
        {
          "sub": "Black hole (silence)",
          "inside": "0 bytes",
          "tone": "muted"
        }
      ],
      [
        "term",
        "term",
        24,
        224,
        912,
        286,
        "Terminal · Redirection Streams"
      ]
    ],
    "code": [
      "# 1. Overwrite stdout to file (> wipes previous content!)",
      "echo \"APP_ENV=production\" > app/test.env",
      "# 2. Append stdout (>> preserves existing content)",
      "echo \"PORT=8080\" >> app/test.env",
      "cat app/test.env",
      "# 3. Redirect errors only (stderr = 2>)",
      "ls /var/log/missing 2> error.log",
      "# 4. Golden DevOps Rule: Combine stdout and stderr into one log",
      "./scripts/backup_db.sh > /var/log/oracle/backup.log 2>&1",
      "# 5. Throw away unwanted output completely",
      "curl -s http://localhost:8080/health > /dev/null"
    ],
    "codeTitle": "Bash · prod-db01",
    "steps": [
      {
        "say": "Har Linux command ke 3 darwaze hote hain: `stdin` (input), `stdout` (normal result), aur `stderr` (error). Dono output screen par aate hain par alag-alag channels par hote hain.",
        "ops": [
          [
            "show",
            "stdin",
            "cmd",
            "fd1",
            "fd2"
          ],
          [
            "link",
            "stdin",
            "cmd",
            {
              "tone": "muted"
            }
          ],
          [
            "link",
            "cmd",
            "fd1",
            {
              "tone": "ok"
            }
          ],
          [
            "link",
            "cmd",
            "fd2",
            {
              "tone": "danger"
            }
          ],
          [
            "flow",
            "cmd",
            "fd1",
            "stdout (1)",
            {
              "tone": "ok",
              "dur": 600
            }
          ],
          [
            "&flow",
            "cmd",
            "fd2",
            "stderr (2)",
            {
              "tone": "danger",
              "dur": 600
            }
          ]
        ],
        "vo": "हर लिनक्स कमांड के तीन दरवाज़े होते हैं: स्टैंडर्ड इन यानी इनपुट, स्टैंडर्ड आउट यानी नॉर्मल रिज़ल्ट, और स्टैंडर्ड एरर यानी एरर। दोनों आउटपुट स्क्रीन पर आते हैं पर अलग-अलग चैनल्स पर होते हैं।"
      },
      {
        "say": "`>` aur `>>` ka farq samjho: `>` purani file ko truncate (khaali) karke likhta hai. `>>` purani file ke neeche nayi line jodta hai (append). Logs ke liye hamesha `>>` use hota hai.",
        "code": [
          0,
          1,
          2,
          3,
          4
        ],
        "ops": [
          [
            "show",
            "outf",
            "term"
          ],
          [
            "link",
            "fd1",
            "outf",
            {
              "label": "> / >>",
              "tone": "ok"
            }
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ echo \"APP_ENV=production\" > app/test.env"
          ],
          [
            "flow",
            "cmd",
            "fd1",
            "echo",
            {
              "tone": "ok",
              "dur": 450
            }
          ],
          [
            "flow",
            "fd1",
            "outf",
            "> write",
            {
              "tone": "ok",
              "dur": 500
            }
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ echo \"PORT=8080\" >> app/test.env"
          ],
          [
            "flow",
            "fd1",
            "outf",
            ">> append",
            {
              "tone": "ok",
              "dur": 500
            }
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ cat app/test.env"
          ],
          [
            "out",
            "term",
            "APP_ENV=production",
            "PORT=8080"
          ],
          [
            "ok",
            "outf"
          ]
        ],
        "vo": "सिंगल ग्रेटर-दैन और डबल ग्रेटर-दैन का फ़र्क़ समझो: सिंगल ग्रेटर-दैन पुरानी फ़ाइल को खाली करके लिखता है। डबल ग्रेटर-दैन पुरानी फ़ाइल के नीचे नई लाइन जोड़ता है, यानी अपेंड। लॉग्स के लिए हमेशा डबल ग्रेटर-दैन यूज़ होता है।"
      },
      {
        "say": "Agar command fail ho, toh error ko alag file mein bhejne ke liye `2>` use karte hain (file descriptor 2 = stderr).",
        "code": [
          5,
          6
        ],
        "ops": [
          [
            "show",
            "errf"
          ],
          [
            "link",
            "fd2",
            "errf",
            {
              "label": "2>",
              "tone": "danger"
            }
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ ls /var/log/missing 2> error.log"
          ],
          [
            "flow",
            "cmd",
            "fd2",
            "error!",
            {
              "tone": "danger",
              "dur": 450
            }
          ],
          [
            "flow",
            "fd2",
            "errf",
            "2> error.log",
            {
              "tone": "danger",
              "dur": 500
            }
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ cat error.log"
          ],
          [
            "out",
            "term",
            "ls: cannot access '/var/log/missing': No such file or directory"
          ],
          [
            "x",
            "errf"
          ]
        ],
        "vo": "अगर कमांड फ़ेल हो, तो एरर को अलग फ़ाइल में भेजने के लिए टू ग्रेटर-दैन यूज़ करते हैं, क्योंकि फ़ाइल डिस्क्रिप्टर टू स्टैंडर्ड एरर होता है।"
      },
      {
        "say": "Production ka sabse famous pattern: `> file.log 2>&1`. Iska matlab hai: \"Success aur Error dono ko ek hi log file mein daalo\". Cron jobs mein yeh 100% zaroori hai.",
        "code": [
          7,
          8
        ],
        "ops": [
          [
            "unlink",
            "fd2",
            "errf"
          ],
          [
            "dim",
            "errf"
          ],
          [
            "label",
            "outf",
            "backup.log",
            "Combined (1 + 2>&1)"
          ],
          [
            "link",
            "fd2",
            "outf",
            {
              "label": "2>&1",
              "tone": "accent"
            }
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ ./scripts/backup_db.sh > /var/log/oracle/backup.log 2>&1"
          ],
          [
            "flow",
            "fd1",
            "outf",
            "stdout",
            {
              "tone": "ok",
              "dur": 600
            }
          ],
          [
            "&flow",
            "fd2",
            "outf",
            "stderr (2>&1)",
            {
              "tone": "accent",
              "dur": 600
            }
          ],
          [
            "pulse",
            "outf"
          ]
        ],
        "vo": "प्रोडक्शन का सबसे फ़ेमस पैटर्न: ग्रेटर-दैन फ़ाइल डॉट लॉग टू ग्रेटर-दैन एम्परसैंड वन। इसका मतलब है: सक्सेस और एरर दोनों को एक ही लॉग फ़ाइल में डालो। क्रॉन जॉब्स में ये हंड्रेड परसेंट ज़रूरी है।"
      },
      {
        "say": "Agar kisi command ka output screen par nahi chahiye (jaise periodic health ping), toh use `/dev/null` par redirect kar do. Yeh Linux ka black hole hai.",
        "code": [
          9,
          10
        ],
        "ops": [
          [
            "show",
            "null"
          ],
          [
            "link",
            "cmd",
            "null",
            {
              "label": "> /dev/null",
              "tone": "muted",
              "bend": -25
            }
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ curl -s http://localhost:8080/health > /dev/null"
          ],
          [
            "flow",
            "cmd",
            "null",
            "discarded",
            {
              "tone": "muted",
              "bend": -25,
              "dur": 600
            }
          ],
          [
            "ok",
            "cmd"
          ]
        ],
        "vo": "अगर किसी कमांड का आउटपुट स्क्रीन पर नहीं चाहिए, जैसे पीरियोडिक हेल्थ पिंग, तो उसे स्लैश डेव स्लैश नल पर रीडायरेक्ट कर दो। ये लिनक्स का ब्लैक होल है।"
      }
    ],
    "points": [
      "`>` = overwrite (purana data uda deta hai); `>>` = append (aage jodta hai).",
      "`1>` ya `>` = standard output (stdout); `2>` = standard error (stderr).",
      "`> log.txt 2>&1` = success aur error dono ek hi file mein save karo.",
      "`> /dev/null 2>&1` = output aur error dono ko chupchap mute (discard) karo."
    ],
    "check": {
      "q": "Production script chalate waqt tum chahte ho ki normal output aur error messages dono `deploy.log` file ke aakhir mein jud jayein. Sahi syntax kaunsa hai?",
      "a": [
        "./deploy.sh > deploy.log",
        "./deploy.sh 2> deploy.log",
        "./deploy.sh >> deploy.log 2>&1",
        "./deploy.sh < deploy.log"
      ],
      "c": 2,
      "why": "`>> deploy.log` output ko append karta hai aur `2>&1` errors ko bhi usi stream mein merge kar deta hai."
    },
    "syntax": {
      "code": "cmd > file.txt        # Overwrite stdout\ncmd >> file.txt       # Append stdout\ncmd 2> error.log      # Redirect stderr\ncmd >> log.txt 2>&1   # Append both stdout and stderr\ncmd > /dev/null 2>&1  # Discard everything",
      "parts": [
        [
          ">",
          "Overwrite stdout."
        ],
        [
          ">>",
          "Append stdout."
        ],
        [
          "2>",
          "Redirect stderr."
        ],
        [
          "2>&1",
          "Send stderr to wherever stdout is pointing."
        ],
        [
          "/dev/null",
          "Discards all written data."
        ]
      ]
    },
    "scenario": "Cron job roz raat database backup chalati hai. Agar output redirect na kiya jaye, toh cron system mail bharta rehta hai ya error kho jata hai. `backup.sh >> /var/log/backup.log 2>&1` lagane se har din ka status timestamp samet file mein milta hai.",
    "tasks": [
      {
        "t": "`todo.txt` file mein nayi line `verify disaster recovery` append karo (`>>`).",
        "sql": "echo \"verify disaster recovery\" >> todo.txt\ncat todo.txt"
      },
      {
        "t": "Ek galat command ka error `err.log` file mein redirect karo (`2>`).",
        "sql": "ls /nonexistent_folder 2> err.log\ncat err.log"
      },
      {
        "t": "`scripts/healthcheck.sh` chalao aur uska saara output `health.log` mein redirect karo.",
        "sql": "./scripts/healthcheck.sh > health.log 2>&1\ncat health.log"
      }
    ],
    "mistakes": [
      {
        "bad": "echo \"line\" > existing_important_file.txt",
        "err": "overwritten file loss",
        "why": "Single `>` purane content ko wipe out kar deta hai. Agar aage jodna hai toh hamesha double `>>` use karo.",
        "fix": "echo \"line\" >> existing_important_file.txt"
      },
      {
        "bad": "cmd 2>&1 > file.log",
        "err": "order bug",
        "why": "Redirection left to right evaluate hota hai. `2>&1` pehle chalega toh stderr screen par hi reh jayega. Sahi order `> file.log 2>&1` hai.",
        "fix": "cmd > file.log 2>&1"
      }
    ],
    "intro": "पानी के तीन पाइप्स सोचो। पाइप वन, साफ़ पानी बराबर नॉर्मल आउटपुट यानी स्टैंडर्ड आउट। पाइप टू, गंदा पानी बराबर एरर अलर्ट्स यानी स्टैंडर्ड एरर। सिंगल ग्रेटर-दैन नए बर्तन में भेजता है, पुराना फेंक कर। डबल ग्रेटर-दैन उसी बर्तन में जोड़ता रहता है। और स्लैश डेव स्लैश नल बराबर नाली जहाँ जो गिरा ग़ायब।"
  },
  {
    "id": "lx-pipes",
    "course": "linux",
    "sec": "Pipes, Redirection aur Log Analysis",
    "title": "Pipes |, tee aur xargs: Chhote tools se badi machine",
    "url": "https://man7.org/linux/man-pages/man1/tee.1.html",
    "meta": "Linux · prod-db01 · bash",
    "summary": "Unix philosophy ki jaan: Pipe `|` ek command ke output ko agli command ka input banata hai. Screen + file dono par likhne ke liye `tee`, aur list ko arguments mein badalne ke liye `xargs`.",
    "simple": "Factory assembly line socho. Pipe 1 raw data lata hai. Pehla worker (`grep`) kharab maal nikaalta hai. Agla worker (`sort`) use line mein lagata hai. Aakhri worker (`head`) top 5 boxes pack karta hai. Poora kaam bina intermediate files ke ek flow mein hota hai.",
    "words": [
      [
        "Pipe (|)",
        "Left command ke stdout ko right command ke stdin se jodta hai."
      ],
      [
        "Pipeline",
        "Kai commands ka silsila (`cmd1 | cmd2 | cmd3`)."
      ],
      [
        "tee",
        "T-splitter: data ko screen par bhi dikhata hai aur file mein bhi save karta hai."
      ],
      [
        "tee -a",
        "File mein append karne wala tee."
      ],
      [
        "xargs",
        "Lines of text ko command arguments mein convert karke agla program chalata hai."
      ]
    ],
    "nodes": [
      [
        "c1",
        "box",
        24,
        42,
        165,
        58,
        "Producer Cmd",
        {
          "sub": "cat / df / find",
          "tone": "file"
        }
      ],
      [
        "p1",
        "proc",
        214,
        48,
        52,
        46,
        "|",
        {
          "tone": "accent"
        }
      ],
      [
        "c2",
        "box",
        292,
        42,
        175,
        58,
        "Filter / Sort",
        {
          "sub": "sort / grep",
          "tone": "proc"
        }
      ],
      [
        "tee",
        "proc",
        494,
        42,
        165,
        58,
        "tee -a",
        {
          "sub": "T-Splitter",
          "tone": "accent"
        }
      ],
      [
        "tlog",
        "doc",
        504,
        128,
        145,
        54,
        "/tmp/health.log",
        {
          "sub": "Saved to disk",
          "tone": "file"
        }
      ],
      [
        "p2",
        "proc",
        684,
        48,
        52,
        46,
        "|",
        {
          "tone": "accent"
        }
      ],
      [
        "c4",
        "box",
        760,
        42,
        176,
        58,
        "xargs ls -l",
        {
          "sub": "Batch executor",
          "tone": "ok"
        }
      ],
      [
        "term",
        "term",
        24,
        212,
        912,
        298,
        "Terminal · The Unix Pipeline"
      ]
    ],
    "code": [
      "# 1. Pipe output of cat into sort",
      "cat todo.txt | sort",
      "# 2. Filter disk usage for /var/log only",
      "df -h | grep \"/var/log\"",
      "# 3. Print to screen AND save to log file at the same time using tee",
      "uptime | tee -a /tmp/health.log",
      "cat /tmp/health.log",
      "# 4. Use xargs to pass filenames to another command",
      "find . -name \"*.tmp\" | xargs ls -l"
    ],
    "codeTitle": "Bash · prod-db01",
    "steps": [
      {
        "say": "Linux ka sabse bada power tool hai Pipe `|`. Yeh do programs ko aapas mein jod deta hai: pehle ka output doosre ka input ban jata hai.",
        "ops": [
          [
            "show",
            "c1",
            "p1",
            "c2",
            "term"
          ],
          [
            "link",
            "c1",
            "p1",
            {
              "tone": "accent"
            }
          ],
          [
            "link",
            "p1",
            "c2",
            {
              "tone": "accent"
            }
          ],
          [
            "flow",
            "c1",
            "p1",
            "stdout",
            {
              "tone": "accent",
              "dur": 500
            }
          ],
          [
            "flow",
            "p1",
            "c2",
            "stdin",
            {
              "tone": "proc",
              "dur": 500
            }
          ]
        ],
        "vo": "लिनक्स का सबसे बड़ा पावर टूल है पाइप। ये दो प्रोग्राम्स को आपस में जोड़ देता है: पहले का आउटपुट दूसरे का इनपुट बन जाता है।"
      },
      {
        "say": "`cat todo.txt | sort` chalao: unorganized lines `sort` ke andar chali jaati hain aur sorted order mein screen par aati hain.",
        "code": [
          0,
          1
        ],
        "ops": [
          [
            "label",
            "c1",
            "cat todo.txt",
            "7 raw lines"
          ],
          [
            "label",
            "c2",
            "sort",
            "A-Z ordered"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ cat todo.txt | sort"
          ],
          [
            "flow",
            "c1",
            "c2",
            "7 lines",
            {
              "tone": "accent",
              "dur": 600
            }
          ],
          [
            "out",
            "term",
            "apply security patch",
            "backup database",
            "backup database",
            "check disk",
            "review slow queries",
            "rotate logs",
            "rotate logs"
          ],
          [
            "ok",
            "c2"
          ]
        ],
        "vo": "कैट टूडू डॉट टी-एक्स-टी पाइप सॉर्ट चलाओ: अनऑर्गनाइज़्ड लाइन्स सॉर्ट के अंदर चली जाती हैं और सॉर्टेड ऑर्डर में स्क्रीन पर आती हैं।"
      },
      {
        "say": "Hazaaron files ya processes mein filter lagana: `df -h | grep \"/var/log\"` se sirf wahi disk line dikhegi jisme `/var/log` ho.",
        "code": [
          2,
          3
        ],
        "ops": [
          [
            "label",
            "c1",
            "df -h",
            "All partitions"
          ],
          [
            "label",
            "c2",
            "grep \"/var/log\"",
            "1 matching row"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ df -h | grep \"/var/log\""
          ],
          [
            "flow",
            "c1",
            "c2",
            "filter /var/log",
            {
              "tone": "ok",
              "dur": 600
            }
          ],
          [
            "out",
            "term",
            "/dev/sda3        20G   17G  2.1G  89% /var/log"
          ],
          [
            "pulse",
            "c2"
          ]
        ],
        "vo": "हज़ारों फ़ाइल्स या प्रोसेसेज़ में फ़िल्टर लगाना: डी-एफ़ डैश एच पाइप ग्रेप स्लैश वार स्लैश लॉग से सिर्फ़ वही डिस्क लाइन दिखेगी जिसमें स्लैश वार स्लैश लॉग हो।"
      },
      {
        "say": "Aksar hum chahte hain ki output terminal par bhi dikhe aur file mein bhi save ho jaye. Iske liye `tee` (ya append ke liye `tee -a`) use hota hai.",
        "code": [
          4,
          5,
          6
        ],
        "ops": [
          [
            "show",
            "tee",
            "tlog"
          ],
          [
            "link",
            "c2",
            "tee",
            {
              "tone": "accent"
            }
          ],
          [
            "link",
            "tee",
            "tlog",
            {
              "label": "file copy",
              "tone": "file"
            }
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ uptime | tee -a /tmp/health.log"
          ],
          [
            "flow",
            "c2",
            "tee",
            "uptime",
            {
              "tone": "accent",
              "dur": 500
            }
          ],
          [
            "flow",
            "tee",
            "tlog",
            "save",
            {
              "tone": "file",
              "dur": 550
            }
          ],
          [
            "out",
            "term",
            " 10:15:22 up 14 days,  3:40,  2 users,  load average: 0.28, 0.42, 0.35"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ cat /tmp/health.log"
          ],
          [
            "out",
            "term",
            " 10:15:22 up 14 days,  3:40,  2 users,  load average: 0.28, 0.42, 0.35"
          ],
          [
            "ok",
            "tlog"
          ]
        ],
        "vo": "अक्सर हम चाहते हैं कि आउटपुट टर्मिनल पर भी दिखे और फ़ाइल में भी सेव हो जाए। इसके लिए टी, या अपेंड के लिए टी डैश ए, यूज़ होता है।"
      },
      {
        "say": "Jab `find` 50 files dhoondhta hai aur un par koi command chalani ho, `xargs` unhe ek line mein saja kar agle program ko deta hai (`find ... | xargs ls -l`).",
        "code": [
          7,
          8
        ],
        "ops": [
          [
            "show",
            "p2",
            "c4"
          ],
          [
            "link",
            "tee",
            "p2",
            {
              "tone": "accent"
            }
          ],
          [
            "link",
            "p2",
            "c4",
            {
              "tone": "ok"
            }
          ],
          [
            "label",
            "c1",
            "find . -name \"*.tmp\"",
            "file paths"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ find . -name \"*.tmp\" | xargs ls -l"
          ],
          [
            "flow",
            "p2",
            "c4",
            "xargs args",
            {
              "tone": "ok",
              "dur": 600
            }
          ],
          [
            "out",
            "term",
            "-rw-r--r-- 1 oracle oinstall 21 Oct 29 10:00 ./sess_01.tmp"
          ],
          [
            "ok",
            "c4"
          ]
        ],
        "vo": "जब फ़ाइंड पचास फ़ाइल्स ढूँढता है और उन पर कोई कमांड चलानी हो, एक्स-आर्ग्स उन्हें एक लाइन में सजा कर अगले प्रोग्राम को देता है।"
      }
    ],
    "points": [
      "Pipe `|` bina temporary file banaye data ek program se doosre mein flow karta hai.",
      "`cmd | grep pattern` = output mein se specific lines filter karo.",
      "`cmd | tee file.log` = screen par bhi dikhao aur file mein bhi likho (`-a` for append).",
      "`find ... | xargs rm` = list of files ko arguments bana kar ek saath process karo."
    ],
    "check": {
      "q": "Tum ek lamba build script chala rahe ho aur chahte ho ki output screen par bhi live scroll kare aur `build.log` mein bhi record ho jaye. Kaunsa tool use karoge?",
      "a": [
        ">",
        ">>",
        "tee",
        "xargs"
      ],
      "c": 2,
      "why": "`tee` (T-junction) stream ko do hisson mein baant deta hai: screen par display aur file mein write."
    },
    "syntax": {
      "code": "cmd1 | cmd2\ncmd1 | cmd2 | cmd3\ncmd | tee filename\ncmd | tee -a filename\nfind ... | xargs cmd",
      "parts": [
        [
          "|",
          "Pipes stdout of left to stdin of right."
        ],
        [
          "tee",
          "Writes to screen and file simultaneously."
        ],
        [
          "tee -a",
          "Appends to file while writing to screen."
        ],
        [
          "xargs",
          "Converts standard input into command-line arguments."
        ]
      ]
    },
    "scenario": "Production incident mein disk bhar gayi. Engineer ne ek line ka pipeline chalaya: `du -sh /var/log/* | sort -h | tail -n 5`. 2 second mein pata chal gaya ki sabse badi 5 log files kaunsi hain.",
    "tasks": [
      {
        "t": "`todo.txt` ko sort karke duplicate counts ke saath dikhao (`sort | uniq -c`).",
        "sql": "cat todo.txt | sort | uniq -c"
      },
      {
        "t": "`df -h` chala kar sirf root `/` partition wali line filter karo (`grep`).",
        "sql": "df -h | grep \"/dev/sda2\""
      },
      {
        "t": "`hostname` command ka output screen par bhi dikhao aur `srv.txt` mein bhi save karo (`tee`).",
        "sql": "hostname | tee srv.txt\ncat srv.txt"
      }
    ],
    "mistakes": [
      {
        "bad": "cat todo.txt > sort",
        "err": "created file named sort",
        "why": "`>` file write karta hai, program nahi chalata. Program ko input dene ke liye pipe `|` zaroori hai.",
        "fix": "cat todo.txt | sort"
      },
      {
        "bad": "find . -name \"*.tmp\" | rm",
        "err": "rm: missing operand",
        "why": "`rm` standard input nahi padhta; use arguments chahiye hote hain. Isliye beech mein `xargs` lagana zaroori hai (`| xargs rm`).",
        "fix": "find . -name \"*.tmp\" | xargs rm"
      }
    ],
    "intro": "फ़ैक्ट्री असेंबली लाइन सोचो। पाइप वन रॉ डेटा लाता है। पहला वर्कर ग्रेप ख़राब माल निकालता है। अगला वर्कर सॉर्ट उसे लाइन में लगाता है। आख़िरी वर्कर हेड टॉप फाइव बॉक्सेज़ पैक करता है। पूरा काम बिना इंटरमीडिएट फ़ाइल्स के एक फ़्लो में होता है।"
  },
  {
    "id": "lx-grep",
    "course": "linux",
    "sec": "Pipes, Redirection aur Log Analysis",
    "title": "grep Mastery: Hazaaron log lines mein sui dhoondhna",
    "url": "https://man7.org/linux/man-pages/man1/grep.1.html",
    "meta": "Linux · prod-db01 · bash",
    "summary": "Sysadmin aur DBA ka #1 weapon: `grep` ke powerful flags (case-insensitive `-i`, invert noise `-v`, count `-c`, line numbers `-n`, recursive `-r`, regex `-E`, aur context `-B/-A`).",
    "simple": "10,000 panno ka phone directory register socho. Tum bolte ho \"Mujhe sirf Sharma naam wale dikhao\" = `grep \"Sharma\"`. \"Case ka farq mat karo (sharma, SHARMA)\" = `-i`. \"Sharma ke alawa sab dikhao\" = `-v`. \"Ginti batao kitne hain\" = `-c`.",
    "words": [
      [
        "grep",
        "Global Regular Expression Print: text mein pattern search karne ka tool."
      ],
      [
        "-i",
        "Case-insensitive: chhota bada letter ek barabar."
      ],
      [
        "-v",
        "Invert match: jo pattern se match NA ho wahi dikhana (noise filter)."
      ],
      [
        "-c",
        "Count: matching lines ki total ginti."
      ],
      [
        "-n",
        "Line number: file mein kaunse number ki line par match mila."
      ],
      [
        "-E",
        "Extended Regex: multiple patterns search karna (\"ERROR|CRITICAL|ORA-\")."
      ],
      [
        "-r / -R",
        "Recursive: poore directory ke andar har file mein search karna."
      ]
    ],
    "nodes": [
      [
        "ltbl",
        "table",
        24,
        38,
        540,
        162,
        "/var/log/syslog & access.log",
        {
          "cols": [
            "LINE",
            "LEVEL / CODE",
            "LOG ENTRY"
          ],
          "cw": [
            0.12,
            0.22,
            0.66
          ]
        }
      ],
      [
        "grep",
        "proc",
        596,
        38,
        175,
        52,
        "grep -i \"error\"",
        {
          "sub": "Case-insensitive",
          "tone": "accent"
        }
      ],
      [
        "cnt",
        "var",
        790,
        38,
        146,
        52,
        "grep -c (Count)",
        {
          "v": "?",
          "tone": "proc"
        }
      ],
      [
        "res",
        "box",
        596,
        114,
        340,
        86,
        "Filtered Matches",
        {
          "sub": "Only actionable lines pass through",
          "tone": "ok"
        }
      ],
      [
        "term",
        "term",
        24,
        216,
        912,
        294,
        "Terminal · grep in Action"
      ]
    ],
    "code": [
      "# 1. Search for word ERROR in syslog",
      "grep -i \"error\" /var/log/syslog",
      "# 2. Count how many ERROR lines exist (-c)",
      "grep -i -c \"error\" /var/log/syslog",
      "# 3. Invert match (-v): filter out 200 OK noise to see failed HTTP requests",
      "grep -v \"200\" /var/log/nginx/access.log",
      "# 4. Search multiple error codes with Extended Regex (-E)",
      "grep -E \"500|502|Connection refused\" /var/log/nginx/error.log",
      "# 5. Search recursively across entire /etc directory",
      "grep -r \"prod-db01\" /etc/hosts"
    ],
    "codeTitle": "Bash · prod-db01",
    "steps": [
      {
        "say": "Production incident mein log file khol kar aakhon se error dhoondhna namumkin hai. `grep` ek second mein sirf wahi lines nikaalta hai jinme target shabd ho.",
        "ops": [
          [
            "show",
            "ltbl",
            "grep",
            "res",
            "term"
          ],
          [
            "rows",
            "ltbl",
            [
              [
                "1",
                "INFO",
                "systemd: Reloaded NGINX reverse proxy"
              ],
              [
                "2",
                "ERROR",
                "payapi[1420]: Connection refused"
              ],
              [
                "3",
                "INFO",
                "sshd: Accepted publickey for oracle"
              ],
              [
                "4",
                "ERROR",
                "payapi.service: Failed with exit-code"
              ]
            ]
          ],
          [
            "link",
            "ltbl",
            "grep",
            {
              "tone": "accent"
            }
          ],
          [
            "link",
            "grep",
            "res",
            {
              "tone": "ok"
            }
          ]
        ],
        "vo": "प्रोडक्शन इंसिडेंट में लॉग फ़ाइल खोल कर आँखों से एरर ढूँढना नामुमकिन है। ग्रेप एक सेकंड में सिर्फ़ वही लाइन्स निकालता है जिनमें टार्गेट शब्द हो।"
      },
      {
        "say": "Logs mein kabhi `ERROR`, kabhi `error`, kabhi `Error` likha hota hai. Isliye hamesha `-i` (ignore case) lagana achhi aadat hai.",
        "code": [
          0,
          1
        ],
        "ops": [
          [
            "fade",
            "ltbl",
            [
              0,
              2
            ]
          ],
          [
            "mark",
            "ltbl",
            [
              1,
              3
            ],
            "danger"
          ],
          [
            "flow",
            "ltbl",
            "grep",
            "scan 4 lines",
            {
              "tone": "accent",
              "dur": 550
            }
          ],
          [
            "flow",
            "grep",
            "res",
            "2 ERROR lines",
            {
              "tone": "danger",
              "dur": 550
            }
          ],
          [
            "label",
            "res",
            "2 Error Lines Matched",
            "payapi[1420] + systemd exit-code"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ grep -i \"error\" /var/log/syslog"
          ],
          [
            "out",
            "term",
            "Oct 29 09:20:14 prod-db01 payapi[1420]: ERROR org.hibernate.engine.jdbc.spi.SqlExceptionHelper - Connection refused",
            "Oct 29 12:05:01 prod-db01 systemd[1]: payapi.service: Failed with result \"exit-code\", ERROR state logged."
          ]
        ],
        "vo": "लॉग्स में कभी कैपिटल एरर, कभी स्मॉल एरर लिखा होता है। इसलिए हमेशा डैश आई, यानी इग्नोर केस, लगाना अच्छी आदत है।"
      },
      {
        "say": "Agar poori lines nahi dekhni, sirf yeh dekhna hai ki error kitni baar aaya, toh `-c` (count) flag lagao.",
        "code": [
          2,
          3
        ],
        "ops": [
          [
            "show",
            "cnt"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ grep -i -c \"error\" /var/log/syslog"
          ],
          [
            "flow",
            "grep",
            "cnt",
            "-c",
            {
              "tone": "proc",
              "dur": 500
            }
          ],
          [
            "val",
            "cnt",
            "2 matches",
            {
              "tone": "danger"
            }
          ],
          [
            "out",
            "term",
            "2"
          ]
        ],
        "vo": "अगर पूरी लाइन्स नहीं देखनी, सिर्फ़ ये देखना है कि एरर कितनी बार आया, तो डैश सी यानी काउंट फ़्लैग लगाओ।"
      },
      {
        "say": "Job Trick #1: `-v` (invert match) se shor (noise) hataya jata hai. Nginx access log mein 99% requests `200 OK` hoti hain. `grep -v \"200\"` chalane se sirf failed requests (404, 500) samne aati hain!",
        "code": [
          4,
          5
        ],
        "ops": [
          [
            "label",
            "ltbl",
            "/var/log/nginx/access.log (grep -v \"200\")"
          ],
          [
            "label",
            "grep",
            "grep -v \"200\"",
            "Invert match (Hide 200 OK)"
          ],
          [
            "rows",
            "ltbl",
            [
              [
                "1",
                "200 OK",
                "GET /api/orders (10.0.1.12)"
              ],
              [
                "2",
                "500 ERR",
                "POST /api/checkout (203.0.113.9)"
              ],
              [
                "3",
                "200 OK",
                "GET /health (192.168.1.50)"
              ],
              [
                "4",
                "404 NOT",
                "GET /wp-login.php (198.51.100.7)"
              ]
            ]
          ],
          [
            "fade",
            "ltbl",
            [
              0,
              2
            ]
          ],
          [
            "mark",
            "ltbl",
            [
              1,
              3
            ],
            "danger"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ grep -v \"200\" /var/log/nginx/access.log"
          ],
          [
            "out",
            "term",
            "203.0.113.9 - - [29/Oct/2026:10:14:05] \"POST /api/checkout HTTP/1.1\" 500 284",
            "203.0.113.9 - - [29/Oct/2026:10:14:08] \"POST /api/checkout HTTP/1.1\" 500 284",
            "198.51.100.7 - - [29/Oct/2026:10:14:22] \"GET /wp-login.php HTTP/1.1\" 404 162",
            "203.0.113.9 - - [29/Oct/2026:10:14:41] \"POST /api/checkout HTTP/1.1\" 500 284"
          ]
        ],
        "vo": "जॉब ट्रिक नंबर वन: डैश वी, यानी इन्वर्ट मैच, से शोर हटाया जाता है। इंजन-एक्स एक्सेस लॉग में नाइंटी-नाइन परसेंट रिक्वेस्ट्स टू हंड्रेड ओके होती हैं। ग्रेप डैश वी टू हंड्रेड चलाने से सिर्फ़ फ़ेल्ड रिक्वेस्ट्स सामने आती हैं!"
      },
      {
        "say": "`-E` se pipe `|` laga kar ek saath kai patterns search kar sakte ho, jaise `500|502|Connection refused`. Har DBA aur Sysadmin ka yeh daily habit hai.",
        "code": [
          6,
          7
        ],
        "ops": [
          [
            "label",
            "grep",
            "grep -E \"500|502\"",
            "Extended Regex (OR)"
          ],
          [
            "flow",
            "grep",
            "res",
            "upstream errors",
            {
              "tone": "danger",
              "dur": 550
            }
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ grep -E \"500|502|Connection refused\" /var/log/nginx/error.log"
          ],
          [
            "out",
            "term",
            "2026/10/29 10:14:05 [error] connect() failed (111: Connection refused) while connecting to upstream",
            "2026/10/29 10:14:08 [error] connect() failed (111: Connection refused) while connecting to upstream"
          ],
          [
            "ok",
            "res"
          ]
        ],
        "vo": "डैश ई से पाइप लगा कर एक साथ कई पैटर्न्स सर्च कर सकते हो, जैसे फाइव हंड्रेड या फाइव ओ टू या कनेक्शन रिफ़्यूज़्ड। हर डी-बी-ए और सिस-एडमिन की ये डेली हैबिट है।"
      }
    ],
    "points": [
      "`grep pattern file` = matching lines screen par lao.",
      "`grep -i` = case-insensitive search.",
      "`grep -v pattern` = invert match (noise filtering ke liye #1 flag).",
      "`grep -c pattern` = matching lines ka count.",
      "`grep -E \"A|B\"` = multiple patterns ek saath search karo."
    ],
    "check": {
      "q": "Nginx log file mein 10 lakh lines hain. Tum dekhna chahte ho ki `500` error kitni baar aaya, par poori 10 lakh lines screen par nahi chahiye. Kaunsa flag use karoge?",
      "a": [
        "grep -i",
        "grep -v",
        "grep -c",
        "grep -r"
      ],
      "c": 2,
      "why": "`-c` (count) matching lines print karne ke bajaye sirf unka total number print karta hai."
    },
    "syntax": {
      "code": "grep [flags] \"pattern\" [file]\ngrep -i \"error\" /var/log/syslog\ngrep -c \"ORA-\" alert.log\ngrep -v \"200\" access.log\ngrep -E \"500|502|503\" access.log\ngrep -rn \"DB_PASS\" /etc/app/",
      "parts": [
        [
          "-i",
          "Ignore case."
        ],
        [
          "-v",
          "Invert match (exclude lines)."
        ],
        [
          "-c",
          "Print only count of matching lines."
        ],
        [
          "-n",
          "Print line number along with each match."
        ],
        [
          "-E",
          "Extended Regular Expressions (OR logic `|`)."
        ],
        [
          "-r",
          "Recursive search in all subdirectories."
        ]
      ]
    },
    "scenario": "Oracle Database hang ho gaya. DBA ne turant `grep -E \"ORA-00060|ORA-04031|ORA-01653\" /var/log/oracle/alert_FREE.log` chalaya aur 5 second mein pata lag gaya ki USERS tablespace full hone se `ORA-01653` aaya tha.",
    "tasks": [
      {
        "t": "`/var/log/syslog` mein word `error` (case-insensitive) search karo (`grep -i`).",
        "sql": "grep -i \"error\" /var/log/syslog"
      },
      {
        "t": "`/var/log/nginx/access.log` se `200` status wali normal lines hata kar errors dikhao (`grep -v`).",
        "sql": "grep -v \"200\" /var/log/nginx/access.log"
      },
      {
        "t": "`/var/log/nginx/access.log` mein `500` error kitni baar aaya hai count karo (`grep -c`).",
        "sql": "grep -c \"500\" /var/log/nginx/access.log"
      }
    ],
    "mistakes": [
      {
        "bad": "grep error /var/log/syslog",
        "err": "missed uppercase matches",
        "why": "Bina `-i` ke `ERROR` ya `Error` wali lines chhoot jaati hain. Log files mein hamesha `-i` lagao.",
        "fix": "grep -i \"error\" /var/log/syslog"
      },
      {
        "bad": "grep \"500|502\" access.log",
        "err": "literal pipe search",
        "why": "Normal grep mein pipe literal character ban jata hai. Multiple OR patterns ke liye `-E` flag zaroori hai (`grep -E \"500|502\"`).",
        "fix": "grep -E \"500|502\" access.log"
      }
    ],
    "intro": "दस हज़ार पन्नों का फ़ोन डायरेक्टरी रजिस्टर सोचो। तुम बोलते हो मुझे सिर्फ़ शर्मा नाम वाले दिखाओ बराबर ग्रेप शर्मा। केस का फ़र्क़ मत करो बराबर डैश आई। शर्मा के अलावा सब दिखाओ बराबर डैश वी। गिनती बताओ कितने हैं बराबर डैश सी।"
  },
  {
    "id": "lx-sort-uniq",
    "course": "linux",
    "sec": "Pipes, Redirection aur Log Analysis",
    "title": "sort, uniq aur cut: Top offending IPs nikaalna",
    "url": "https://man7.org/linux/man-pages/man1/uniq.1.html",
    "meta": "Linux · prod-db01 · bash",
    "summary": "Production log analysis ka classic trio: `cut -d\" \" -f1` se IP column kato, `sort` karo, `uniq -c` se frequency count nikalo, aur `sort -nr | head -n 5` se DDoS ya crawler attack pakdo.",
    "simple": "Web server par achanak traffic spike aaya. Har request line mein IP hota hai. `cut` se sirf IP chunta hai. `sort` unhe ek jaisa jama deta hai. `uniq -c` ginta hai kis IP ne kitni baar hit kiya. Top count dekh kar rogue IP ko firewall se block kar diya jata hai.",
    "words": [
      [
        "cut -d -f",
        "Delimiter (-d) par line tod kar specific field (-f) chuna."
      ],
      [
        "sort",
        "Alphabetical ya numeric sorting tool."
      ],
      [
        "sort -n",
        "Numeric sort (2 ko 10 se pehle rakhna)."
      ],
      [
        "sort -r",
        "Reverse order (sabse bada pehle)."
      ],
      [
        "sort -k",
        "Key column par sort karna (e.g. `sort -k2,2`)."
      ],
      [
        "uniq",
        "Adjacent duplicate lines ko collapse karna."
      ],
      [
        "uniq -c",
        "Duplicate lines ke aage unka count print karna."
      ]
    ],
    "nodes": [
      [
        "pst",
        "stages",
        24,
        32,
        912,
        34,
        "GOLDEN LOG ANALYSIS PIPELINE",
        {
          "items": [
            "1. Raw access.log",
            "2. cut -d\" \" -f1",
            "3. sort | uniq -c",
            "4. sort -nr (Top IP)"
          ],
          "tone": "accent",
          "at": 0
        }
      ],
      [
        "iptbl",
        "table",
        24,
        86,
        620,
        120,
        "IP Traffic Aggregation Table",
        {
          "cols": [
            "HITS",
            "IP ADDRESS (FIELD 1)",
            "REQUEST / VERDICT"
          ],
          "cw": [
            0.16,
            0.34,
            0.5
          ]
        }
      ],
      [
        "culprit",
        "box",
        668,
        86,
        268,
        120,
        "Top Spammer Identified",
        {
          "sub": "Ready for firewall block",
          "tone": "muted"
        }
      ],
      [
        "term",
        "term",
        24,
        220,
        912,
        290,
        "Terminal · Golden Log Pipeline"
      ]
    ],
    "code": [
      "# 1. Extract first column (IP address) from access.log",
      "cut -d\" \" -f1 /var/log/nginx/access.log",
      "# 2. Golden DevOps Pipeline: Count hits per IP",
      "cut -d\" \" -f1 /var/log/nginx/access.log | sort | uniq -c",
      "# 3. Sort by hit count descending (top offender first)",
      "cut -d\" \" -f1 /var/log/nginx/access.log | sort | uniq -c | sort -nr",
      "# 4. Extract usernames from /etc/passwd using colon delimiter",
      "cut -d\":\" -f1 /etc/passwd"
    ],
    "codeTitle": "Bash · prod-db01",
    "steps": [
      {
        "say": "Web server crash hone par sabse pehla sawal: kaunsa IP server ko bomb kar raha hai? Is pipeline ko Linux engineer ka golden knife bola jata hai.",
        "ops": [
          [
            "show",
            "pst",
            "iptbl",
            "culprit",
            "term"
          ],
          [
            "at",
            "pst",
            0
          ],
          [
            "rows",
            "iptbl",
            [
              [
                "-",
                "192.168.1.50",
                "GET /health 200"
              ],
              [
                "-",
                "203.0.113.9",
                "POST /api/checkout 500"
              ],
              [
                "-",
                "198.51.100.7",
                "GET /wp-login.php 404"
              ]
            ]
          ]
        ],
        "vo": "वेब सर्वर क्रैश होने पर सबसे पहला सवाल: कौनसा आई-पी सर्वर को बॉम्ब कर रहा है? इस पाइपलाइन को लिनक्स इंजीनियर का गोल्डन नाइफ़ बोला जाता है।"
      },
      {
        "say": "Pehle `cut -d\" \" -f1` lagao. Delimiter space hai, aur humein pehla column (IP) chahiye.",
        "code": [
          0,
          1
        ],
        "ops": [
          [
            "at",
            "pst",
            1
          ],
          [
            "colhl",
            "iptbl",
            [
              1
            ],
            "accent"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ cut -d\" \" -f1 /var/log/nginx/access.log"
          ],
          [
            "out",
            "term",
            "192.168.1.50",
            "203.0.113.9",
            "192.168.1.50",
            "203.0.113.9",
            "198.51.100.7",
            "203.0.113.9"
          ]
        ],
        "vo": "पहले कट डैश डी स्पेस डैश एफ़ वन लगाओ। डिलिमिटर स्पेस है, और हमें पहला कॉलम यानी आई-पी चाहिए।"
      },
      {
        "say": "Important: `uniq` sirf sath judi hui (adjacent) duplicates pehchanta hai! Isliye `uniq` lagane se pehle `sort` lagana compulsory hai.",
        "code": [
          2,
          3
        ],
        "ops": [
          [
            "at",
            "pst",
            2
          ],
          [
            "colhl",
            "iptbl",
            [
              0,
              1
            ],
            "proc"
          ],
          [
            "rows",
            "iptbl",
            [
              [
                "2",
                "192.168.1.50",
                "Internal healthcheck"
              ],
              [
                "1",
                "198.51.100.7",
                "Bot scanner"
              ],
              [
                "3",
                "203.0.113.9",
                "Checkout flooder!"
              ]
            ]
          ],
          [
            "mark",
            "iptbl",
            [
              2
            ],
            "danger"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ cut -d\" \" -f1 /var/log/nginx/access.log | sort | uniq -c"
          ],
          [
            "out",
            "term",
            "   2 192.168.1.50",
            "   1 198.51.100.7",
            "   3 203.0.113.9"
          ]
        ],
        "vo": "इम्पॉर्टेंट: यूनीक सिर्फ़ साथ जुड़ी हुई डुप्लिकेट्स पहचानता है! इसलिए यूनीक लगाने से पहले सॉर्ट लगाना कंपल्सरी है।"
      },
      {
        "say": "Ab aakhri step: sabse zyada hit karne wale IP ko top par lane ke liye `sort -nr` (numeric + reverse) lagao.",
        "code": [
          4,
          5
        ],
        "ops": [
          [
            "at",
            "pst",
            3
          ],
          [
            "sort",
            "iptbl",
            [
              2,
              0,
              1
            ]
          ],
          [
            "mark",
            "iptbl",
            [
              0
            ],
            "danger"
          ],
          [
            "flow",
            "iptbl#0",
            "culprit",
            "3 hits (#1)",
            {
              "tone": "danger",
              "dur": 600
            }
          ],
          [
            "label",
            "culprit",
            "203.0.113.9 (3 Hits)",
            "Top Offending IP!"
          ],
          [
            "tone",
            "culprit",
            "danger"
          ],
          [
            "x",
            "culprit"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ cut -d\" \" -f1 /var/log/nginx/access.log | sort | uniq -c | sort -nr"
          ],
          [
            "out",
            "term",
            "   3 203.0.113.9",
            "   2 192.168.1.50",
            "   1 198.51.100.7"
          ]
        ],
        "vo": "अब आख़िरी स्टेप: सबसे ज़्यादा हिट करने वाले आई-पी को टॉप पर लाने के लिए सॉर्ट डैश एन-आर, यानी न्यूमेरिक और रिवर्स, लगाओ।"
      },
      {
        "say": "`cut` delimiter badal kar kisi bhi structured file par chal sakta hai, jaise `/etc/passwd` mein colon `:` delimiter hota hai.",
        "code": [
          6,
          7
        ],
        "ops": [
          [
            "colhl",
            "iptbl",
            []
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ cut -d\":\" -f1 /etc/passwd"
          ],
          [
            "out",
            "term",
            "root",
            "oracle",
            "appuser",
            "nginx"
          ],
          [
            "ok",
            "iptbl"
          ]
        ],
        "vo": "कट डिलिमिटर बदल कर किसी भी स्ट्रक्चर्ड फ़ाइल पर चल सकता है, जैसे स्लैश ई-टी-सी स्लैश पास-डब्ल्यू-डी में कोलन डिलिमिटर होता है।"
      }
    ],
    "points": [
      "`uniq` tabhi kaam karta hai jab data pehle se `sort` ho.",
      "`cut -d\" \" -f1` = pehla column nikaalo.",
      "`uniq -c` = har item ki frequency count nikaalo.",
      "`sort -nr` = numeric + reverse sorting (highest count on top)."
    ],
    "check": {
      "q": "`uniq` command chalane se pehle `sort` karna kyun zaroori hota hai?",
      "a": [
        "Kyunki bina sort ke error throw hota hai.",
        "Kyunki uniq sirf bagal-bagal (adjacent) aane wali duplicate lines ko pakadta hai.",
        "Kyunki sort file ko compress kar deta hai.",
        "Kyunki uniq sirf numbers par chalti hai."
      ],
      "c": 1,
      "why": "`uniq` poori file yaad nahi rakhta; yeh sirf pichhli line se match check karta hai. Agar duplicate lines door-door hain toh unhe group karne ke liye pehle `sort` zaroori hai."
    },
    "syntax": {
      "code": "cut -d\"<delim>\" -f<col> <file>\nsort [options] <file>\nuniq [options] <file>\n\n# Classic triage chain:\ncut -d\" \" -f1 access.log | sort | uniq -c | sort -nr | head -n 10",
      "parts": [
        [
          "-d",
          "Delimiter character (space, colon, comma)."
        ],
        [
          "-f",
          "Field (column) number starting from 1."
        ],
        [
          "-n",
          "Numeric sort (treat 10 > 2)."
        ],
        [
          "-r",
          "Reverse sort (descending order)."
        ],
        [
          "-c",
          "Prefix lines by number of occurrences."
        ]
      ]
    },
    "scenario": "Production payment gateway par brute-force attack hua. SecOps engineer ne 10 second mein `cut -d\" \" -f1 /var/log/nginx/access.log | sort | uniq -c | sort -nr | head -n 1` chalaya aur rogue IP `203.0.113.9` ko drop karne ka iptables rule laga diya.",
    "tasks": [
      {
        "t": "`/var/log/nginx/access.log` se space delimiter par pehla column (IPs) extract karo (`cut`).",
        "sql": "cut -d\" \" -f1 /var/log/nginx/access.log"
      },
      {
        "t": "`todo.txt` ko sort karke duplicate task counts dikhao (`sort | uniq -c`).",
        "sql": "cat todo.txt | sort | uniq -c"
      },
      {
        "t": "Access log ke IPs ki frequency count nikaal kar descending order mein sort karo.",
        "sql": "cut -d\" \" -f1 /var/log/nginx/access.log | sort | uniq -c | sort -nr"
      }
    ],
    "mistakes": [
      {
        "bad": "cut -d\" \" -f1 access.log | uniq -c",
        "err": "duplicate counts fragmented",
        "why": "`uniq` bina `sort` ke fragmented counts dega agar same IP beech mein firse aa jaye.",
        "fix": "cut -d\" \" -f1 access.log | sort | uniq -c"
      },
      {
        "bad": "sort -r numbers.txt",
        "err": "alphabetical reverse (100 before 20)",
        "why": "Normal sort alphabetical hota hai. Numbers ko sahi sort karne ke liye `-n` flag zaroori hai (`sort -nr`).",
        "fix": "sort -nr numbers.txt"
      }
    ],
    "intro": "वेब सर्वर पर अचानक ट्रैफ़िक स्पाइक आया। हर रिक्वेस्ट लाइन में आई-पी होता है। कट से सिर्फ़ आई-पी चुनते हैं। सॉर्ट उन्हें एक जैसा जमा देता है। यूनीक डैश सी गिनता है किस आई-पी ने कितनी बार हिट किया। टॉप काउंट देख कर रोग आई-पी को फ़ायरवॉल से ब्लॉक कर दिया जाता है।"
  },
  {
    "id": "lx-awk",
    "course": "linux",
    "sec": "Pipes, Redirection aur Log Analysis",
    "title": "awk Power: Columns extract karna aur math filters",
    "url": "https://man7.org/linux/man-pages/man1/awk.1.html",
    "meta": "Linux · prod-db01 · bash",
    "summary": "Linux ka mini programming language: `awk` har line ke columns ko `$1, $2, ... $NF` mein todta hai. Space delimit bina setting ke handle karta hai, conditional filtering (`$9 == 500`), aur disk thresholds (`$5 > 80`).",
    "simple": "Excel sheet socho bina mouse ke. `awk '{print $1, $4}'` bolta hai \"Sheet ka Column A aur Column D print karo\". `awk '$9 >= 500 {print $1, $7}'` bolta hai \"Jahan status code 500 ya upar ho, sirf wahi IP aur URL dikhao\".",
    "words": [
      [
        "awk",
        "Pattern scanning aur text processing language."
      ],
      [
        "$1, $2, $3",
        "Line ka pehla, doosra, teesra column (whitespace separated)."
      ],
      [
        "$0",
        "Poori complete line."
      ],
      [
        "$NF",
        "Number of Fields: line ka sabse aakhri column (last column)."
      ],
      [
        "NR",
        "Number of Records: current line number."
      ],
      [
        "-F",
        "Field separator change karna (jaise `-F\":\"` for passwd)."
      ],
      [
        "Condition",
        "Filtering expression jaise `$9 == 500` ya `$5 > 80`."
      ],
      [
        "BEGIN / END",
        "Processing shuru hone se pehle ya khatam hone ke baad chalne wale blocks."
      ]
    ],
    "nodes": [
      [
        "atbl",
        "table",
        24,
        38,
        600,
        162,
        "access.log (Space-Separated Columns)",
        {
          "cols": [
            "$1 (IP)",
            "$6 (VERB)",
            "$7 (URL)",
            "$9 (STATUS)",
            "$NF (BYTES)"
          ],
          "cw": [
            0.24,
            0.16,
            0.26,
            0.17,
            0.17
          ]
        }
      ],
      [
        "awk",
        "proc",
        652,
        38,
        284,
        58,
        "awk Column Engine",
        {
          "sub": "Splits whitespace automatically",
          "tone": "accent"
        }
      ],
      [
        "res",
        "box",
        652,
        114,
        284,
        86,
        "Extracted Output",
        {
          "sub": "Waiting for awk rule...",
          "tone": "proc"
        }
      ],
      [
        "term",
        "term",
        24,
        218,
        912,
        292,
        "Terminal · awk Column Processor"
      ]
    ],
    "code": [
      "# 1. Print first ($1) and ninth ($9) column of Nginx access log",
      "awk '{print $1, $9}' /var/log/nginx/access.log",
      "# 2. Filter lines where status code ($9) equals 500",
      "awk '$9 == \"500\" {print $1, $7, $9}' /var/log/nginx/access.log",
      "# 3. Print last column ($NF) regardless of how many columns exist",
      "awk '{print $NF}' /var/log/nginx/access.log",
      "# 4. Use custom delimiter (-F\":\") on /etc/passwd to get user and shell",
      "awk -F\":\" '{print $1, \"->\", $7}' /etc/passwd"
    ],
    "codeTitle": "Bash · prod-db01",
    "steps": [
      {
        "say": "Jab log lines mein multiple spaces ya complex columns hon, `cut` fail ho jata hai. Wahan `awk` aata hai: yeh multiple spaces ko ek delimiter manta hai aur columns ko `$1, $2` bana deta hai.",
        "ops": [
          [
            "show",
            "atbl",
            "awk",
            "res",
            "term"
          ],
          [
            "rows",
            "atbl",
            [
              [
                "192.168.1.50",
                "\"GET",
                "/health",
                "200",
                "45"
              ],
              [
                "203.0.113.9",
                "\"POST",
                "/api/checkout",
                "500",
                "284"
              ],
              [
                "10.0.1.14",
                "\"GET",
                "/api/products",
                "200",
                "9840"
              ],
              [
                "198.51.100.7",
                "\"GET",
                "/wp-login.php",
                "404",
                "162"
              ]
            ]
          ],
          [
            "link",
            "atbl",
            "awk",
            {
              "tone": "accent"
            }
          ],
          [
            "link",
            "awk",
            "res",
            {
              "tone": "proc"
            }
          ]
        ],
        "vo": "जब लॉग लाइन्स में मल्टिपल स्पेसेज़ या कॉम्प्लेक्स कॉलम्स हों, कट फ़ेल हो जाता है। वहाँ ऑक आता है: ये मल्टिपल स्पेसेज़ को एक डिलिमिटर मानता है और कॉलम्स को डॉलर वन, डॉलर टू बना देता है।"
      },
      {
        "say": "Nginx log se IP ($1) aur HTTP status ($9) print karo. Simple `{print $1, $9}` syntax.",
        "code": [
          0,
          1
        ],
        "ops": [
          [
            "colhl",
            "atbl",
            [
              0,
              3
            ],
            "accent"
          ],
          [
            "label",
            "awk",
            "awk '{print $1, $9}'",
            "Extract IP & Status Code"
          ],
          [
            "flow",
            "atbl",
            "awk",
            "$1, $9",
            {
              "tone": "accent",
              "dur": 550
            }
          ],
          [
            "label",
            "res",
            "IP + Status ($1, $9)",
            "192.168.1.50 200 · 203.0.113.9 500"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ awk '{print $1, $9}' /var/log/nginx/access.log"
          ],
          [
            "out",
            "term",
            "192.168.1.50 200",
            "203.0.113.9 500",
            "192.168.1.50 200",
            "203.0.113.9 500",
            "198.51.100.7 404",
            "203.0.113.9 500"
          ]
        ],
        "vo": "इंजन-एक्स लॉग से आई-पी यानी डॉलर वन और एच-टी-टी-पी स्टेटस यानी डॉलर नाइन प्रिंट करो। सिंपल प्रिंट डॉलर वन कॉमा डॉलर नाइन सिंटैक्स।"
      },
      {
        "say": "Ab condition lagao: Humein sirf wahi records chahiye jahan status code ($9) 500 ho, aur sath mein URL ($7) bhi dekhna hai.",
        "code": [
          2,
          3
        ],
        "ops": [
          [
            "colhl",
            "atbl",
            [
              0,
              2,
              3
            ],
            "danger"
          ],
          [
            "fade",
            "atbl",
            [
              0,
              2,
              3
            ]
          ],
          [
            "mark",
            "atbl",
            [
              1
            ],
            "danger"
          ],
          [
            "label",
            "awk",
            "awk '$9 == \"500\"'",
            "Filter row where col 9 is 500"
          ],
          [
            "flow",
            "awk",
            "res",
            "500 matches",
            {
              "tone": "danger",
              "dur": 550
            }
          ],
          [
            "label",
            "res",
            "203.0.113.9 /api/checkout 500",
            "Only HTTP 500 failures!"
          ],
          [
            "tone",
            "res",
            "danger"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ awk '$9 == \"500\" {print $1, $7, $9}' /var/log/nginx/access.log"
          ],
          [
            "out",
            "term",
            "203.0.113.9 /api/checkout 500",
            "203.0.113.9 /api/checkout 500",
            "203.0.113.9 /api/checkout 500"
          ]
        ],
        "vo": "अब कंडीशन लगाओ: हमें सिर्फ़ वही रिकॉर्ड्स चाहिए जहाँ स्टेटस कोड डॉलर नाइन बराबर फाइव हंड्रेड हो, और साथ में यू-आर-एल यानी डॉलर सेवन भी देखना है।"
      },
      {
        "say": "Trick: Agar pata na ho ki line mein kitne columns hain par hamesha aakhri column chahiye, toh `$NF` use karo (`NF` = Number of Fields).",
        "code": [
          4,
          5
        ],
        "ops": [
          [
            "unfade",
            "atbl"
          ],
          [
            "unmark",
            "atbl"
          ],
          [
            "colhl",
            "atbl",
            [
              4
            ],
            "proc"
          ],
          [
            "label",
            "awk",
            "awk '{print $NF}'",
            "NF = Last Column (Response Bytes)"
          ],
          [
            "label",
            "res",
            "$NF Response Sizes",
            "45, 284, 9840, 162 bytes"
          ],
          [
            "tone",
            "res",
            "proc"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ awk '{print $NF}' /var/log/nginx/access.log"
          ],
          [
            "out",
            "term",
            "1240",
            "284",
            "4820",
            "284",
            "162",
            "284"
          ]
        ],
        "vo": "ट्रिक: अगर पता न हो कि लाइन में कितने कॉलम्स हैं पर हमेशा आख़िरी कॉलम चाहिए, तो डॉलर एन-एफ़ यूज़ करो, यानी नंबर ऑफ़ फ़ील्ड्स।"
      },
      {
        "say": "Delimiter colon `:` karne ke liye `-F\":\"` lagao. `/etc/passwd` se username ($1) aur shell ($7) ek jhatke mein print ho jayenge.",
        "code": [
          6,
          7
        ],
        "ops": [
          [
            "colhl",
            "atbl",
            []
          ],
          [
            "label",
            "awk",
            "awk -F\":\" '{print $1, $7}'",
            "Custom delimiter \":\" on /etc/passwd"
          ],
          [
            "tone",
            "res",
            "ok"
          ],
          [
            "label",
            "res",
            "User -> Login Shell",
            "oracle -> /bin/bash"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ awk -F\":\" '{print $1, \"->\", $7}' /etc/passwd"
          ],
          [
            "out",
            "term",
            "root -> /bin/bash",
            "oracle -> /bin/bash",
            "appuser -> /bin/bash",
            "nginx -> /usr/sbin/nologin"
          ],
          [
            "ok",
            "awk"
          ],
          [
            "ok",
            "res"
          ]
        ],
        "vo": "डिलिमिटर कोलन करने के लिए डैश कैपिटल एफ़ कोलन लगाओ। स्लैश ई-टी-सी स्लैश पास-डब्ल्यू-डी से यूज़रनेम डॉलर वन और शेल डॉलर सेवन एक झटके में प्रिंट हो जाएँगे।"
      }
    ],
    "points": [
      "`awk '{print $1, $2}'` = pehla aur doosra column print karo.",
      "`$NF` = last column of line.",
      "`awk '$condition {print}'` = matching condition wali lines print karo.",
      "`-F\":\"` = delimiter colon set karo (default is whitespace)."
    ],
    "check": {
      "q": "Nginx log file mein aakhri column response size in bytes hota hai. Chahe line mein kitne bhi shabd hon, aakhri column print karne ka sabse safe variable kaunsa hai?",
      "a": [
        "$10",
        "$LAST",
        "$NF",
        "$0"
      ],
      "c": 2,
      "why": "`$NF` hamesha current line ke aakhri column ki value represent karta hai."
    },
    "syntax": {
      "code": "awk '{print $1}' file.txt\nawk '$3 == \"ERROR\" {print $1, $2}' file.txt\nawk -F\":\" '{print $1}' /etc/passwd\nawk '$5 > 80 {print $0}' file.txt",
      "parts": [
        [
          "$1, $2",
          "Column index."
        ],
        [
          "$NF",
          "Last column in current row."
        ],
        [
          "$0",
          "Entire line."
        ],
        [
          "-F",
          "Custom field separator."
        ],
        [
          "{print ...}",
          "Action to execute on matched rows."
        ]
      ]
    },
    "scenario": "Monitoring script likhna tha jo disk 85% se upar hone par email kare. Engineer ne banaya: `df -h | awk 'NR>1 {gsub(\"%\",\"\",$5); if ($5 > 85) print $6, $5\"%\"}'`. Ek line mein alert ready!",
    "tasks": [
      {
        "t": "`/var/log/nginx/access.log` se IP ($1) aur HTTP method ($6) print karo (`awk`).",
        "sql": "awk '{print $1, $6}' /var/log/nginx/access.log"
      },
      {
        "t": "Nginx log se sirf wahi lines dikhao jahan status code 500 ho (`awk '$9 == \"500\"'`).",
        "sql": "awk '$9 == \"500\" {print $1, $7, $9}' /var/log/nginx/access.log"
      },
      {
        "t": "`/etc/passwd` se username ($1) aur user ID ($3) colon delimiter ke sath print karo.",
        "sql": "awk -F\":\" '{print $1, $3}' /etc/passwd"
      }
    ],
    "mistakes": [
      {
        "bad": "awk {print $1} file.txt",
        "err": "syntax error",
        "why": "`awk` expression hamesha single quotes `'...'` mein band hona chahiye, warna bash shell `$1` ko apni variable samajh kar khaali kar dega.",
        "fix": "awk '{print $1}' file.txt"
      },
      {
        "bad": "awk -F: {print $1} /etc/passwd",
        "err": "missing quotes around delimiter and action",
        "why": "`-F\":\"` aur `'{print $1}'` dono ko quote karna safe practice hai.",
        "fix": "awk -F\":\" '{print $1}' /etc/passwd"
      }
    ],
    "intro": "एक्सेल शीट सोचो बिना माउस के। ऑक प्रिंट डॉलर वन कॉमा डॉलर फोर बोलता है शीट का कॉलम ए और कॉलम डी प्रिंट करो। ऑक डॉलर नाइन ग्रेटर-दैन इक्वल फाइव हंड्रेड प्रिंट डॉलर वन कॉमा डॉलर सेवन बोलता है जहाँ स्टेटस कोड फाइव हंड्रेड या ऊपर हो, सिर्फ़ वही आई-पी और यू-आर-एल दिखाओ।"
  },
  {
    "id": "lx-sed",
    "course": "linux",
    "sec": "Pipes, Redirection aur Log Analysis",
    "title": "sed: Stream Editor se bina file khole find & replace",
    "url": "https://man7.org/linux/man-pages/man1/sed.1.html",
    "meta": "Linux · prod-db01 · bash",
    "summary": "Automation aur CI/CD pipelines ki lifeline: `sed 's/old/new/g' file`. Bina vim ya nano khole configuration files mein values replace karna, in-place edit `-i`, aur comments hata kar clean config dekhna.",
    "simple": "Word processor ka \"Find and Replace All\" feature socho, par bina file khole command line se. `sed 's/DEBUG=true/DEBUG=false/' app.env` screen par replace karke dikhata hai. Aur `-i` lagane se file ke andar seedha save ho jata hai.",
    "words": [
      [
        "sed",
        "Stream Editor: stream of text ko modify karne ka tool."
      ],
      [
        "s/search/replace/",
        "Substitute command."
      ],
      [
        "/g flag",
        "Global: har line ke har match ko replace karo (sirf pehle ko nahi)."
      ],
      [
        "-i",
        "In-place edit: output screen par dikhane ke bajaye seedha file mein save karo."
      ],
      [
        "-i.bak",
        "In-place edit with automatic backup file banakar modify karna."
      ],
      [
        "^#",
        "Regex: jo lines hash `#` se shuru hoti hain (comments)."
      ],
      [
        "sed '/^#/d'",
        "Comment lines ko delete karke clean file display karna."
      ]
    ],
    "nodes": [
      [
        "ftbl",
        "table",
        24,
        42,
        420,
        150,
        "app/app.env (Config File)",
        {
          "cols": [
            "LINE",
            "KEY",
            "VALUE",
            "STATE"
          ],
          "cw": [
            0.14,
            0.28,
            0.28,
            0.3
          ]
        }
      ],
      [
        "sed",
        "proc",
        474,
        52,
        210,
        62,
        "sed 's/3000/8080/g'",
        {
          "sub": "Preview mode (stdout)",
          "tone": "accent"
        }
      ],
      [
        "mode",
        "chip",
        474,
        134,
        210,
        30,
        "Mode: Dry-Run Preview",
        {
          "tone": "accent"
        }
      ],
      [
        "bak",
        "doc",
        720,
        52,
        216,
        86,
        "app.env.bak",
        {
          "sub": "Created by sed -i.bak",
          "tone": "file"
        }
      ],
      [
        "term",
        "term",
        24,
        214,
        912,
        296,
        "Terminal · sed in Action"
      ]
    ],
    "code": [
      "# 1. Preview find-and-replace on screen (file is NOT modified)",
      "sed 's/3000/8080/g' app/app.env",
      "# 2. Modify file in-place using -i",
      "sed -i 's/3000/8080/g' app/app.env",
      "cat app/app.env",
      "# 3. Modify with safety backup (.bak)",
      "sed -i.bak 's/dev/prod/g' app/app.env",
      "ls -l app/",
      "# 4. Filter out commented lines and empty lines",
      "sed '/^#/d' /etc/hosts"
    ],
    "codeTitle": "Bash · prod-db01",
    "steps": [
      {
        "say": "50 servers par Nginx port 3000 se badal kar 8080 karna ho, toh har server par vim khol kar edit nahi kiya jata. `sed` ek command mein poori file update kar deta hai.",
        "ops": [
          [
            "show",
            "ftbl",
            "sed",
            "mode",
            "term"
          ],
          [
            "rows",
            "ftbl",
            [
              [
                "1",
                "PORT",
                "3000",
                "Original"
              ],
              [
                "2",
                "APP_ENV",
                "dev",
                "Original"
              ],
              [
                "3",
                "DB_HOST",
                "localhost",
                "Original"
              ],
              [
                "4",
                "DB_PORT",
                "1521",
                "Original"
              ]
            ]
          ],
          [
            "link",
            "ftbl",
            "sed",
            {
              "tone": "accent"
            }
          ]
        ],
        "vo": "पचास सर्वर्स पर इंजन-एक्स पोर्ट थ्री थाउज़ंड से बदल कर एटी-एटी करना हो, तो हर सर्वर पर विम खोल कर एडिट नहीं किया जाता। सेड एक कमांड में पूरी फ़ाइल अपडेट कर देता है।"
      },
      {
        "say": "Safety Rule: Hamesha pehle bina `-i` ke chala kar screen par output verify karo. Dekho ki replacement sahi ho raha hai ya nahi.",
        "code": [
          0,
          1
        ],
        "ops": [
          [
            "mark",
            "ftbl",
            [
              0
            ],
            "accent"
          ],
          [
            "flow",
            "ftbl#0",
            "sed",
            "PORT=3000",
            {
              "tone": "accent",
              "dur": 550
            }
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ sed 's/3000/8080/g' app/app.env"
          ],
          [
            "out",
            "term",
            "PORT=8080",
            "APP_ENV=dev",
            "DB_HOST=localhost",
            "DB_PORT=1521"
          ]
        ],
        "vo": "सेफ़्टी रूल: हमेशा पहले बिना डैश आई के चला कर स्क्रीन पर आउटपुट वेरिफ़ाई करो। देखो कि रिप्लेसमेंट सही हो रहा है या नहीं।"
      },
      {
        "say": "Jab tasalli ho jaye ki replacement bilkul sahi hai, tab `-i` (in-place) flag lagao. Ab file ke andar changes permanently save ho jayenge.",
        "code": [
          2,
          3,
          4
        ],
        "ops": [
          [
            "label",
            "sed",
            "sed -i 's/3000/8080/g'",
            "In-place file update"
          ],
          [
            "label",
            "mode",
            "Mode: Saved In-Place (-i)"
          ],
          [
            "tone",
            "mode",
            "ok"
          ],
          [
            "flow",
            "sed",
            "ftbl#0",
            "write 8080",
            {
              "tone": "ok",
              "dur": 550
            }
          ],
          [
            "cell",
            "ftbl",
            0,
            2,
            "8080"
          ],
          [
            "cell",
            "ftbl",
            0,
            3,
            "Updated (-i)"
          ],
          [
            "mark",
            "ftbl",
            [
              0
            ],
            "ok"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ sed -i 's/3000/8080/g' app/app.env"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ cat app/app.env"
          ],
          [
            "out",
            "term",
            "PORT=8080",
            "APP_ENV=dev",
            "DB_HOST=localhost",
            "DB_PORT=1521"
          ]
        ],
        "vo": "जब तसल्ली हो जाए कि रिप्लेसमेंट बिल्कुल सही है, तब डैश आई यानी इन-प्लेस फ़्लैग लगाओ। अब फ़ाइल के अंदर चेंजेस पर्मनेंटली सेव हो जाएँगे।"
      },
      {
        "say": "Senior DevOps Pro Tip: Production mein `-i.bak` lagao. Yeh change karne se pehle automatic backup file `app.env.bak` bana dega.",
        "code": [
          5,
          6,
          7
        ],
        "ops": [
          [
            "show",
            "bak"
          ],
          [
            "link",
            "ftbl",
            "bak",
            {
              "label": "-i.bak",
              "tone": "file",
              "bend": -25
            }
          ],
          [
            "flow",
            "ftbl",
            "bak",
            "backup copy",
            {
              "tone": "file",
              "bend": -25,
              "dur": 550
            }
          ],
          [
            "cell",
            "ftbl",
            1,
            2,
            "prod"
          ],
          [
            "cell",
            "ftbl",
            1,
            3,
            "Updated + .bak"
          ],
          [
            "mark",
            "ftbl",
            [
              1
            ],
            "ok"
          ],
          [
            "ok",
            "bak"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ sed -i.bak 's/dev/prod/g' app/app.env"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ ls -l app/"
          ],
          [
            "out",
            "term",
            "-rw-r--r-- 1 oracle oinstall 80 Oct 29 10:15 app.env",
            "-rw-r--r-- 1 oracle oinstall 80 Oct 29 10:15 app.env.bak"
          ]
        ],
        "vo": "सीनियर डेव-ऑप्स प्रो टिप: प्रोडक्शन में डैश आई डॉट बैक लगाओ। ये चेंज करने से पहले ऑटोमैटिक बैकअप फ़ाइल ऐप डॉट ई-एन-वी डॉट बैक बना देगा।"
      },
      {
        "say": "`sed '/^#/d'` se config files mein se saare faltu comments `#` delete ho jaate hain aur sirf kaam ki lines dikhti hain.",
        "code": [
          8,
          9
        ],
        "ops": [
          [
            "label",
            "sed",
            "sed '/^#/d' /etc/hosts",
            "Strip comment lines (#)"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ sed '/^#/d' /etc/hosts"
          ],
          [
            "out",
            "term",
            "127.0.0.1 localhost",
            "::1 localhost ip6-localhost ip6-loopback",
            "192.168.1.10 prod-db01.local prod-db01"
          ],
          [
            "ok",
            "sed"
          ]
        ],
        "vo": "सेड कैरेट हैश डी से कॉन्फ़िग फ़ाइल्स में से सारे फ़ालतू कमेंट्स डिलीट हो जाते हैं और सिर्फ़ काम की लाइन्स दिखती हैं।"
      }
    ],
    "points": [
      "`sed 's/old/new/g' file` = find and replace (screen preview only).",
      "`sed -i 's/old/new/g' file` = permanently edit file in-place.",
      "`sed -i.bak ...` = backup file banakar edit karo.",
      "`/g` flag zaroori hai warna line ka sirf pehla match badlega."
    ],
    "check": {
      "q": "Tumne `sed 's/localhost/192.168.1.50/g' db.conf` chalaya. Screen par replacement dikh gaya par jab `cat db.conf` kiya toh purana hi localhost likha tha. File modify kyun nahi hui?",
      "a": [
        "Kyunki command mein error tha.",
        "Kyunki bina `-i` flag ke sed sirf screen par preview dikhata hai, file save nahi karta.",
        "Kyunki root access chahiye tha.",
        "Kyunki /g flag galat jagah tha."
      ],
      "c": 1,
      "why": "`sed` default mein standard output par print karta hai. Disk file modify karne ke liye `-i` (in-place) flag dena zaroori hai."
    },
    "syntax": {
      "code": "sed 's/old/new/g' file.txt\nsed -i 's/old/new/g' file.txt\nsed -i.bak 's/old/new/g' file.txt\nsed '/pattern/d' file.txt",
      "parts": [
        [
          "s",
          "Substitute command."
        ],
        [
          "old",
          "Search text or regex pattern."
        ],
        [
          "new",
          "Replacement text."
        ],
        [
          "g",
          "Global flag (replace all occurrences on each line)."
        ],
        [
          "-i",
          "In-place edit (saves directly to file)."
        ],
        [
          "/d",
          "Delete matching lines."
        ]
      ]
    },
    "scenario": "Deployment ke time environment variable `DATABASE_URL` staging se production cluster par switch karna tha. GitLab CI pipeline ne sed se ek second mein replace kiya: `sed -i \"s/db-staging/db-prod/g\" .env.production`.",
    "tasks": [
      {
        "t": "`app/app.env` mein `PORT=3000` ko `PORT=8080` se preview replace karo (bina `-i`).",
        "sql": "sed 's/3000/8080/g' app/app.env"
      },
      {
        "t": "`app/app.env` mein `PORT=3000` ko `PORT=8080` se in-place replace karo (`-i`) aur `cat` karke verify karo.",
        "sql": "sed -i 's/3000/8080/g' app/app.env\ncat app/app.env"
      },
      {
        "t": "`/etc/hosts` file se comment lines hata kar clean hosts dikhao (`sed '/^#/d'`).",
        "sql": "sed '/^#/d' /etc/hosts"
      }
    ],
    "mistakes": [
      {
        "bad": "sed -i 's/old/new/' file.txt",
        "err": "only first match per line changed",
        "why": "Aakhri `/g` chhoot jane se har line ka sirf pehla match badalta hai. Hamesha `/g` lagao.",
        "fix": "sed -i 's/old/new/g' file.txt"
      },
      {
        "bad": "sed -i 's//var/log//tmp/log/g' file.txt",
        "err": "sed: bad delimiter",
        "why": "Jab path mein slashes `/` hon, sed confuse ho jata hai. Slashes ke bajaye koi doosra delimiter use karo jaise pipe `s|/var/log|/tmp/log|g`.",
        "fix": "sed -i 's|/var/log|/tmp/log|g' file.txt"
      }
    ],
    "intro": "वर्ड प्रोसेसर का फ़ाइंड एंड रिप्लेस ऑल फ़ीचर सोचो, पर बिना फ़ाइल खोले कमांड लाइन से। सेड एस स्लैश डीबग बराबर ट्रू स्लैश डीबग बराबर फ़ॉल्स स्क्रीन पर रिप्लेस करके दिखाता है। और डैश आई लगाने से फ़ाइल के अंदर सीधा सेव हो जाता है।"
  },
  {
    "id": "lx-users",
    "course": "linux",
    "sec": "User Management, Permissions aur sudo",
    "title": "Users, Groups aur /etc/passwd: Kaun hai server par?",
    "url": "https://man7.org/linux/man-pages/man5/passwd.5.html",
    "meta": "Linux · prod-db01 · bash",
    "summary": "Linux Multi-user architecture: UID/GID, system users vs human users, root user (UID 0), `/etc/passwd` ka 7-field structure, `/etc/shadow` ke hashed passwords, `whoami`, `id`, `useradd`, aur `usermod`.",
    "simple": "Office building ka ID card system socho. Har employee ka ek badge number (UID) hota hai aur ek department (GID). `root` = building owner jiske paas master key hai. Normal employee sirf apna cabin khol sakta hai. Aur `/etc/passwd` = security guard ka master attendance register.",
    "words": [
      [
        "UID",
        "User ID: Linux kernel har user ko number se pehchanta hai (root = 0)."
      ],
      [
        "GID",
        "Group ID: team ya department ka ID number."
      ],
      [
        "root",
        "Superuser: Linux system ka supreme authority jise koi permission rok nahi sakti."
      ],
      [
        "/etc/passwd",
        "System ke saare users ka register (readable by all)."
      ],
      [
        "/etc/shadow",
        "User passwords ke encrypted hashes (only readable by root)."
      ],
      [
        "/etc/group",
        "Groups aur unke members ki list."
      ],
      [
        "whoami",
        "Current active username batane wali command."
      ],
      [
        "id",
        "Current user ka UID, GID aur group memberships dikhane wali command."
      ]
    ],
    "nodes": [
      [
        "root",
        "proc",
        24,
        32,
        185,
        46,
        "root (UID: 0)",
        {
          "sub": "Superuser",
          "tone": "danger"
        }
      ],
      [
        "ora",
        "proc",
        24,
        90,
        185,
        46,
        "oracle (UID: 1001)",
        {
          "sub": "Groups: oinstall, dba",
          "tone": "accent"
        }
      ],
      [
        "app",
        "proc",
        24,
        148,
        185,
        46,
        "appuser (UID: 1002)",
        {
          "sub": "Microservice user",
          "tone": "ok"
        }
      ],
      [
        "ptbl",
        "table",
        235,
        38,
        495,
        156,
        "/etc/passwd (7 Colon-Separated Fields)",
        {
          "cols": [
            "USER",
            "PW",
            "UID",
            "GID",
            "HOME",
            "SHELL"
          ],
          "cw": [
            0.16,
            0.08,
            0.12,
            0.12,
            0.28,
            0.24
          ]
        }
      ],
      [
        "shd",
        "disk",
        760,
        48,
        172,
        92,
        "/etc/shadow",
        {
          "sub": "Root-only (0400)",
          "inside": "SHA-512 Hashes",
          "tone": "danger",
          "level": 0.75
        }
      ],
      [
        "term",
        "term",
        24,
        218,
        912,
        292,
        "Terminal · Identity & Users"
      ]
    ],
    "code": [
      "# 1. Who am I right now?",
      "whoami",
      "# 2. Inspect current UID, GID and supplementary groups",
      "id",
      "# 3. Read user registry from /etc/passwd",
      "grep \"oracle\" /etc/passwd",
      "# 4. View groups oracle belongs to",
      "groups",
      "# 5. Check logged in users and system uptime",
      "w"
    ],
    "codeTitle": "Bash · prod-db01",
    "steps": [
      {
        "say": "Linux ek multi-user operating system hai. Ek hi waqt par database admin, app deployment aur automated services aapas mein isolate hokar kaam karte hain.",
        "ops": [
          [
            "show",
            "root",
            "ora",
            "app",
            "ptbl",
            "term"
          ],
          [
            "rows",
            "ptbl",
            [
              [
                "root",
                "x",
                "0",
                "0",
                "/root",
                "/bin/bash"
              ],
              [
                "oracle",
                "x",
                "1001",
                "1001",
                "/home/oracle",
                "/bin/bash"
              ],
              [
                "appuser",
                "x",
                "1002",
                "1002",
                "/home/appuser",
                "/bin/bash"
              ],
              [
                "nginx",
                "x",
                "998",
                "998",
                "/var/cache/nginx",
                "/sbin/nologin"
              ]
            ]
          ]
        ],
        "vo": "लिनक्स एक मल्टी-यूज़र ऑपरेटिंग सिस्टम है। एक ही वक़्त पर डेटाबेस एडमिन, ऐप डिप्लॉयमेंट और ऑटोमेटेड सर्विसेज़ आपस में आइसोलेट होकर काम करते हैं।"
      },
      {
        "say": "Terminal par baith kar pehla sawal: \"Main kaun hoon aur mere paas kya haq hain?\". `whoami` username batata hai aur `id` poori kundli nikaalta hai.",
        "code": [
          0,
          1,
          2,
          3
        ],
        "ops": [
          [
            "pulse",
            "ora"
          ],
          [
            "ok",
            "ora"
          ],
          [
            "mark",
            "ptbl",
            [
              1
            ],
            "accent"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ whoami"
          ],
          [
            "out",
            "term",
            "oracle"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ id"
          ],
          [
            "out",
            "term",
            "uid=1000(oracle) gid=1000(oinstall) groups=1000(oinstall),1001(dba),27(sudo)"
          ]
        ],
        "vo": "टर्मिनल पर बैठ कर पहला सवाल: मैं कौन हूँ और मेरे पास क्या हक़ हैं? हू-एम-आई यूज़रनेम बताता है और आई-डी पूरी कुंडली निकालता है।"
      },
      {
        "say": "`/etc/passwd` file ke har record mein 7 columns hote hain: `username:password_flag:UID:GID:GECOS:home_dir:shell`.",
        "code": [
          4,
          5
        ],
        "ops": [
          [
            "fade",
            "ptbl",
            [
              0,
              2,
              3
            ]
          ],
          [
            "colhl",
            "ptbl",
            [
              0,
              2,
              3,
              4,
              5
            ],
            "accent"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ grep \"oracle\" /etc/passwd"
          ],
          [
            "out",
            "term",
            "oracle:x:1000:1000:Oracle DB Admin:/home/oracle:/bin/bash"
          ]
        ],
        "vo": "स्लैश ई-टी-सी स्लैश पास-डब्ल्यू-डी फ़ाइल के हर रिकॉर्ड में सात कॉलम्स होते हैं: यूज़रनेम, पासवर्ड फ़्लैग, यू-आई-डी, जी-आई-डी, डिस्क्रिप्शन, होम डायरेक्टरी और शेल।"
      },
      {
        "say": "Notice karo password column mein `x` likha hai. Security ke liye real password hashes `/etc/shadow` mein hote hain, jo sirf root padh sakta hai.",
        "code": [
          6,
          7
        ],
        "ops": [
          [
            "unfade",
            "ptbl"
          ],
          [
            "colhl",
            "ptbl",
            [
              1
            ],
            "danger"
          ],
          [
            "show",
            "shd"
          ],
          [
            "lock",
            "shd"
          ],
          [
            "link",
            "ptbl",
            "shd",
            {
              "label": "x -> hash",
              "tone": "danger"
            }
          ],
          [
            "flow",
            "ptbl",
            "shd",
            "encrypted",
            {
              "tone": "danger",
              "dur": 550
            }
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ groups"
          ],
          [
            "out",
            "term",
            "oinstall dba sudo"
          ]
        ],
        "vo": "नोटिस करो पासवर्ड कॉलम में एक्स लिखा है। सिक्योरिटी के लिए रियल पासवर्ड हैशेज़ स्लैश ई-टी-सी स्लैश शैडो में होते हैं, जो सिर्फ़ रूट पढ़ सकता है।"
      },
      {
        "say": "Command `w` ya `who` se pata chalta hai ki server par is waqt kaun kaun log SSH session lekar baithe hain.",
        "code": [
          8,
          9
        ],
        "ops": [
          [
            "colhl",
            "ptbl",
            []
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ w"
          ],
          [
            "out",
            "term",
            " 10:20:01 up 14 days,  2 users,  load average: 0.28, 0.42, 0.35",
            "USER     TTY      FROM             LOGIN@   IDLE   JCPU   PCPU WHAT",
            "oracle   pts/0    192.168.1.50     09:15    0.00s  0.12s  0.02s w"
          ],
          [
            "ok",
            "ptbl"
          ]
        ],
        "vo": "कमांड डब्ल्यू या हू से पता चलता है कि सर्वर पर इस वक़्त कौन-कौन लोग एस-एस-एच सेशन लेकर बैठे हैं।"
      }
    ],
    "points": [
      "`root` ka UID hamesha 0 hota hai; normal users ka UID aam taur par 1000+ hota hai.",
      "`id` command se pata chalta hai user kaunse groups (dba, sudo, docker) ka member hai.",
      "`/etc/passwd` public readable hota hai; password hashes `/etc/shadow` mein root-only secure hote hain.",
      "System services (nginx, mysql, sshd) apne dedicated non-root accounts par chalti hain."
    ],
    "check": {
      "q": "Linux system mein root user ki pehchan kis se hoti hai?",
      "a": [
        "Sirf username \"root\" hone se",
        "UID = 0 hone se",
        "Home directory /home/root hone se",
        "Group dba hone se"
      ],
      "c": 1,
      "why": "Linux kernel ke liye username sirf display label hai; kernel level par root ka matlab UID 0 hota hai. UID 0 wale user ke paas supreme permissions hoti hain."
    },
    "syntax": {
      "code": "whoami\nid [username]\ngroups [username]\nuseradd -m -s /bin/bash <newuser>\nusermod -aG <group> <username>\nw / who",
      "parts": [
        [
          "whoami",
          "Print current logged in username."
        ],
        [
          "id",
          "Display user and group numeric IDs."
        ],
        [
          "groups",
          "List all group memberships."
        ],
        [
          "useradd -m",
          "Create new user with home directory."
        ],
        [
          "usermod -aG",
          "Append user to an additional group."
        ],
        [
          "w",
          "Show who is logged in and what they are doing."
        ]
      ]
    },
    "scenario": "Oracle installation ke dauran installer fail ho gaya: \"User oracle does not belong to dba group\". DBA ne turant `usermod -aG dba oracle` chalaya aur `id oracle` se verify kiya. Group jodte hi database files access hona shuru ho gayi.",
    "tasks": [
      {
        "t": "Current logged-in user check karo (`whoami`).",
        "sql": "whoami"
      },
      {
        "t": "Current user ka UID, GID aur group list inspect karo (`id`).",
        "sql": "id"
      },
      {
        "t": "`/etc/passwd` file se `oracle` user ki entry dhoondho (`grep`).",
        "sql": "grep \"oracle\" /etc/passwd"
      }
    ],
    "mistakes": [
      {
        "bad": "usermod -G dba oracle",
        "err": "removed from all other groups!",
        "why": "Bina `-a` (append) flag ke `-G` purane saare groups (jaise sudo, oinstall) uda deta hai! Hamesha `-aG` use karo.",
        "fix": "usermod -aG dba oracle"
      },
      {
        "bad": "cat /etc/shadow",
        "err": "Permission denied",
        "why": "`/etc/shadow` mein encrypted passwords hote hain. Normal user use nahi padh sakta; sirf root ya `sudo` ke zariye access milta hai.",
        "fix": "sudo cat /etc/shadow"
      }
    ],
    "intro": "ऑफ़िस बिल्डिंग का आई-डी कार्ड सिस्टम सोचो। हर एम्प्लॉई का एक बैज नंबर यानी यू-आई-डी होता है और एक डिपार्टमेंट यानी जी-आई-डी। रूट बराबर बिल्डिंग ओनर जिसके पास मास्टर की है। नॉर्मल एम्प्लॉई सिर्फ़ अपना केबिन खोल सकता है। और स्लैश ई-टी-सी स्लैश पास-डब्ल्यू-डी बराबर सिक्योरिटी गार्ड का मास्टर अटेंडेंस रजिस्टर।"
  },
  {
    "id": "lx-chmod",
    "course": "linux",
    "sec": "User Management, Permissions aur sudo",
    "title": "chmod Deep Dive: 755 vs 600, rwx aur Octal Maths",
    "url": "https://man7.org/linux/man-pages/man1/chmod.1.html",
    "meta": "Linux · prod-db01 · bash",
    "summary": "Linux permissions ka DNA: `rwx` (Read=4, Write=2, Execute=1). Teen khandan: Owner (`u`), Group (`g`), Others (`o`). 755 (scripts & dirs), 644 (config & files), 600 (SSH keys & secrets), 700 (private home). Symbolic `chmod +x` vs Numeric `chmod 755`.",
    "simple": "Teen locker socho: 1. Owner (tum), 2. Family (group), 3. Duniya (others). Har ek ke paas 3 rights ho sakte hain: Padhna (Read=4), Likhna (Write=2), Chalana (Execute=1). Total 7 = sab kuch. 5 = padho aur chalao. 4 = sirf padho. 0 = bilkul mana.",
    "words": [
      [
        "r (Read = 4)",
        "File padhne ya directory ki list dekhne ki ijazat."
      ],
      [
        "w (Write = 2)",
        "File edit/delete karne ya directory mein nayi file banane ki ijazat."
      ],
      [
        "x (Execute = 1)",
        "Script/program chalane ya directory ke andar enter (`cd`) karne ki ijazat."
      ],
      [
        "755 (rwxr-xr-x)",
        "Owner sab kuch kar sakta hai; baqi sab sirf read aur execute kar sakte hain."
      ],
      [
        "644 (rw-r--r--)",
        "Standard file permission: owner read-write, baqi sab read-only."
      ],
      [
        "600 (rw-------)",
        "Ultra secret: sirf owner padh aur likh sakta hai (SSH private keys, .env)."
      ],
      [
        "chmod +x",
        "Script ko runnable (executable) banane ka shortcut."
      ]
    ],
    "nodes": [
      [
        "vu",
        "var",
        24,
        38,
        145,
        52,
        "User / Owner (u)",
        {
          "v": "rw- (4+2+0 = 6)",
          "tone": "ok"
        }
      ],
      [
        "vg",
        "var",
        184,
        38,
        145,
        52,
        "Group (g)",
        {
          "v": "r-- (4+0+0 = 4)",
          "tone": "accent"
        }
      ],
      [
        "vo",
        "var",
        344,
        38,
        145,
        52,
        "Others (o)",
        {
          "v": "r-- (4+0+0 = 4)",
          "tone": "muted"
        }
      ],
      [
        "res",
        "proc",
        24,
        112,
        465,
        56,
        "644 (-rw-r--r--) · Not Executable",
        {
          "sub": "r=4, w=2, x=1",
          "tone": "accent"
        }
      ],
      [
        "ftbl",
        "table",
        514,
        38,
        422,
        134,
        "Production Permission Standards",
        {
          "cols": [
            "FILE",
            "OCTAL",
            "SYMBOLIC",
            "PURPOSE"
          ],
          "cw": [
            0.3,
            0.14,
            0.26,
            0.3
          ]
        }
      ],
      [
        "term",
        "term",
        24,
        194,
        912,
        316,
        "Terminal · Permissions Calculation"
      ]
    ],
    "code": [
      "# 1. View current file permissions with ls -l",
      "ls -l scripts/backup_db.sh",
      "# 2. Make script executable for owner (+x)",
      "chmod +x scripts/backup_db.sh",
      "ls -l scripts/backup_db.sh",
      "# 3. Secure sensitive credentials file to 600 (owner only)",
      "chmod 600 app/app.env",
      "ls -l app/app.env",
      "# 4. Standard web/config file permission: 644",
      "chmod 644 todo.txt",
      "ls -l todo.txt"
    ],
    "codeTitle": "Bash · prod-db01",
    "steps": [
      {
        "say": "Linux mein koi bhi file bina permission ke run nahi ho sakti. `ls -l` chalane par pehli 10 characters file ki permission hoti hain, jaise `-rwxr-xr-x`.",
        "ops": [
          [
            "show",
            "vu",
            "vg",
            "vo",
            "res",
            "ftbl",
            "term"
          ],
          [
            "rows",
            "ftbl",
            [
              [
                "backup_db.sh",
                "644",
                "-rw-r--r--",
                "Missing +x!"
              ],
              [
                "app/app.env",
                "644",
                "-rw-r--r--",
                "Secret exposed!"
              ],
              [
                "todo.txt",
                "644",
                "-rw-r--r--",
                "Normal doc"
              ]
            ]
          ]
        ],
        "vo": "लिनक्स में कोई भी फ़ाइल बिना परमिशन के रन नहीं हो सकती। एल-एस डैश एल चलाने पर पहले दस कैरेक्टर्स फ़ाइल की परमिशन होती हैं, जैसे डैश आर-डब्ल्यू-एक्स आर-डैश-एक्स आर-डैश-एक्स।"
      },
      {
        "say": "Check karo `scripts/backup_db.sh`. Agar execute bit missing ho (`-rw-r--r--`), toh `./backup_db.sh` chalane par `Permission denied` error aayega.",
        "code": [
          0,
          1
        ],
        "ops": [
          [
            "mark",
            "ftbl",
            [
              0
            ],
            "danger"
          ],
          [
            "x",
            "res"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ ls -l scripts/backup_db.sh"
          ],
          [
            "out",
            "term",
            "-rw-r--r-- 1 oracle oinstall 320 Oct 29 09:30 scripts/backup_db.sh"
          ]
        ],
        "vo": "चेक करो स्क्रिप्ट्स स्लैश बैकअप डी-बी डॉट एस-एच। अगर एग्ज़ीक्यूट बिट मिसिंग हो, तो डॉट स्लैश बैकअप डी-बी डॉट एस-एच चलाने पर परमिशन डिनाइड एरर आएगा।"
      },
      {
        "say": "Is script ko runnable banane ke liye `chmod +x` chalao. Ab permission `-rwxr-xr-x` ban jayegi aur script run ho sakegi.",
        "code": [
          2,
          3,
          4
        ],
        "ops": [
          [
            "unx",
            "res"
          ],
          [
            "val",
            "vu",
            "rwx (4+2+1 = 7)",
            {
              "tone": "ok"
            }
          ],
          [
            "val",
            "vg",
            "r-x (4+0+1 = 5)",
            {
              "tone": "accent"
            }
          ],
          [
            "val",
            "vo",
            "r-x (4+0+1 = 5)",
            {
              "tone": "accent"
            }
          ],
          [
            "label",
            "res",
            "755 (-rwxr-xr-x) · Executable Script",
            "Owner: rwx (7) · Group: r-x (5) · Others: r-x (5)"
          ],
          [
            "tone",
            "res",
            "ok"
          ],
          [
            "ok",
            "res"
          ],
          [
            "cell",
            "ftbl",
            0,
            1,
            "755"
          ],
          [
            "cell",
            "ftbl",
            0,
            2,
            "-rwxr-xr-x"
          ],
          [
            "cell",
            "ftbl",
            0,
            3,
            "Runnable script"
          ],
          [
            "mark",
            "ftbl",
            [
              0
            ],
            "ok"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ chmod +x scripts/backup_db.sh"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ ls -l scripts/backup_db.sh"
          ],
          [
            "out",
            "term",
            "-rwxr-xr-x 1 oracle oinstall 320 Oct 29 09:30 scripts/backup_db.sh"
          ]
        ],
        "vo": "इस स्क्रिप्ट को रनेबल बनाने के लिए सी-एच-मॉड प्लस एक्स चलाओ। अब परमिशन आर-डब्ल्यू-एक्स बन जाएगी और स्क्रिप्ट रन हो सकेगी।"
      },
      {
        "say": "Job Rule: Passwords, API keys aur SSH private keys par kabhi 777 ya 644 mat chhodna! Unhe `chmod 600` (rw-------) karo taaki server par koi doosra user na padh sake.",
        "code": [
          5,
          6,
          7
        ],
        "ops": [
          [
            "unok",
            "res"
          ],
          [
            "val",
            "vu",
            "rw- (4+2+0 = 6)",
            {
              "tone": "ok"
            }
          ],
          [
            "val",
            "vg",
            "--- (0)",
            {
              "tone": "danger"
            }
          ],
          [
            "val",
            "vo",
            "--- (0)",
            {
              "tone": "danger"
            }
          ],
          [
            "label",
            "res",
            "600 (-rw-------) · Strictly Private",
            "Secrets, .env, SSH keys (Group & Others = 0)"
          ],
          [
            "tone",
            "res",
            "proc"
          ],
          [
            "lock",
            "res"
          ],
          [
            "cell",
            "ftbl",
            1,
            1,
            "600"
          ],
          [
            "cell",
            "ftbl",
            1,
            2,
            "-rw-------"
          ],
          [
            "cell",
            "ftbl",
            1,
            3,
            "Locked secret"
          ],
          [
            "mark",
            "ftbl",
            [
              1
            ],
            "accent"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ chmod 600 app/app.env"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ ls -l app/app.env"
          ],
          [
            "out",
            "term",
            "-rw------- 1 oracle oinstall 80 Oct 29 10:15 app/app.env"
          ]
        ],
        "vo": "जॉब रूल: पासवर्ड्स, ए-पी-आई कीज़ और एस-एस-एच प्राइवेट कीज़ पर कभी सेवन-सेवन-सेवन या सिक्स-फोर-फोर मत छोड़ना! उन्हें सी-एच-मॉड सिक्स हंड्रेड करो ताकि सर्वर पर कोई दूसरा यूज़र न पढ़ सके।"
      },
      {
        "say": "Normal documentation, logs aur web static files ke liye standard permission `644` (rw-r--r--) hoti hai.",
        "code": [
          8,
          9,
          10
        ],
        "ops": [
          [
            "unlock",
            "res"
          ],
          [
            "val",
            "vg",
            "r-- (4)",
            {
              "tone": "accent"
            }
          ],
          [
            "val",
            "vo",
            "r-- (4)",
            {
              "tone": "muted"
            }
          ],
          [
            "label",
            "res",
            "644 (-rw-r--r--) · Standard Text File",
            "Owner writes (6), everyone else reads (4)"
          ],
          [
            "tone",
            "res",
            "ok"
          ],
          [
            "ok",
            "res"
          ],
          [
            "mark",
            "ftbl",
            [
              2
            ],
            "ok"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ chmod 644 todo.txt"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ ls -l todo.txt"
          ],
          [
            "out",
            "term",
            "-rw-r--r-- 1 oracle oinstall 150 Oct 29 10:00 todo.txt"
          ]
        ],
        "vo": "नॉर्मल डॉक्यूमेंटेशन, लॉग्स और वेब स्टैटिक फ़ाइल्स के लिए स्टैंडर्ड परमिशन सिक्स-फोर-फोर होती है।"
      }
    ],
    "points": [
      "Maths yaad rakho: Read = 4, Write = 2, Execute = 1 (4+2+1 = 7).",
      "`755` = Programs aur directories ke liye standard permission.",
      "`644` = Normal files ke liye standard permission.",
      "`600` = Secret keys aur sensitive passwords ke liye standard permission.",
      "Production par kabhi `chmod 777` mat lagana (huge security breach)."
    ],
    "check": {
      "q": "SSH private key file `id_rsa` ke liye AWS/Linux par mandatory permission kaunsi honi chahiye warna SSH connect hone se mana kar dega?",
      "a": [
        "777",
        "755",
        "644",
        "600 (ya 400)"
      ],
      "c": 3,
      "why": "SSH client strictly check karta hai ki private key file kisi doosre user ke liye readable na ho. Agar 644 ya 777 ho toh \"UNPROTECTED PRIVATE KEY FILE\" error aata hai."
    },
    "syntax": {
      "code": "chmod +x script.sh          # Make executable\nchmod 755 script.sh         # rwxr-xr-x (owner all, others read+exec)\nchmod 644 file.txt          # rw-r--r-- (owner read-write, others read)\nchmod 600 secrets.env       # rw------- (owner read-write, nobody else)\nchmod -R 755 /var/www/html  # Recursive for directory tree",
      "parts": [
        [
          "4",
          "Read permission."
        ],
        [
          "2",
          "Write permission."
        ],
        [
          "1",
          "Execute permission."
        ],
        [
          "+x",
          "Add execute flag."
        ],
        [
          "-R",
          "Apply recursively to all subdirectories and files."
        ]
      ]
    },
    "scenario": "Junior developer ne error aane par quick fix ke chakkar mein poori `/u01/app/oracle` par `chmod -R 777` chala diya. Security audit mein severe red flag raise hua kyunki database data files koi bhi app user modify kar sakta tha. Senior DBA ne turant 700/600 permissions restore kari.",
    "tasks": [
      {
        "t": "`scripts/backup_db.sh` ko executable banao (`chmod +x`) aur `ls -l` se check karo.",
        "sql": "chmod +x scripts/backup_db.sh\nls -l scripts/backup_db.sh"
      },
      {
        "t": "`app/app.env` ko secure karo taaki sirf owner padh sake (`chmod 600`).",
        "sql": "chmod 600 app/app.env\nls -l app/app.env"
      },
      {
        "t": "`todo.txt` ko standard file permission `644` assign karo.",
        "sql": "chmod 644 todo.txt\nls -l todo.txt"
      }
    ],
    "mistakes": [
      {
        "bad": "chmod 777 config.php",
        "err": "critical security vulnerability",
        "why": "`777` ka matlab hai koi bhi hacker ya local compromised user us file mein code inject kar sakta hai. Sensitive files par hamesha 600 ya 640 rakho.",
        "fix": "chmod 600 config.php"
      },
      {
        "bad": "chmod -R 777 /var",
        "err": "system broken (sudo stops working)",
        "why": "Agar `/etc/sudoers` ya `/usr/bin/sudo` par 777 ho jaye, toh Linux security safeguard ke tahat sudo command chalna band kar deta hai!",
        "fix": "chmod 440 /etc/sudoers"
      }
    ],
    "intro": "तीन लॉकर सोचो: पहला ओनर यानी तुम, दूसरा फ़ैमिली यानी ग्रुप, तीसरा दुनिया यानी अदर्स। हर एक के पास तीन राइट्स हो सकते हैं: पढ़ना यानी रीड बराबर फोर, लिखना यानी राइट बराबर टू, चलाना यानी एग्ज़ीक्यूट बराबर वन। टोटल सेवन बराबर सब कुछ। फाइव बराबर पढ़ो और चलाओ। फोर बराबर सिर्फ़ पढ़ो। ज़ीरो बराबर बिल्कुल मना।"
  },
  {
    "id": "lx-chown-sudo",
    "course": "linux",
    "sec": "User Management, Permissions aur sudo",
    "title": "chown, chgrp aur sudoers: Production security guard",
    "url": "https://man7.org/linux/man-pages/man8/sudo.8.html",
    "meta": "Linux · prod-db01 · bash",
    "summary": "Production security ka rule: root account se direct login kabhi mat karo. File ownership badalne ke liye `chown user:group file`, recursive ownership `-R`, aur temporary admin powers ke liye `sudo`. `/etc/sudoers` ka structure aur audit logging.",
    "simple": "VIP locker room socho. Har tijori ka ek maalik hai (`chown`). Agar tum normal employee ho par server reboot karna hai, toh tum direct root nahi bante; tum security guard ko apna ID card dikha kar `sudo` bolte ho. Guard attendance book mein likhta hai ki tumne kya kiya aur ijazat deta hai.",
    "words": [
      [
        "chown",
        "Change Owner: file ya folder ka maalik badalna (`chown oracle:oinstall file`)."
      ],
      [
        "chgrp",
        "Change Group: sirf group ownership badalna."
      ],
      [
        "sudo",
        "SuperUser DO: regular user ko root powers ke saath command chalane ki ijazat dena."
      ],
      [
        "/etc/sudoers",
        "Configuration file jahan likha hota hai kaunsa user kya sudo chala sakta hai."
      ],
      [
        "visudo",
        "Sudoers file ko safe tareeqe se edit karne ka tool (syntax checking ke saath)."
      ],
      [
        "audit log",
        "Har sudo command ka record `/var/log/auth.log` mein hamesha save hota hai."
      ]
    ],
    "nodes": [
      [
        "usr",
        "user",
        36,
        48,
        62,
        54,
        "oracle",
        {
          "sub": "Admin user",
          "tone": "accent"
        }
      ],
      [
        "fenv",
        "doc",
        150,
        42,
        180,
        74,
        "app/app.env",
        {
          "sub": "owner: oracle:oinstall",
          "tone": "file"
        }
      ],
      [
        "sudo",
        "proc",
        385,
        52,
        165,
        56,
        "sudo Gate",
        {
          "sub": "/etc/sudoers policy",
          "tone": "proc"
        }
      ],
      [
        "rootcmd",
        "box",
        600,
        48,
        165,
        64,
        "systemctl restart",
        {
          "sub": "Runs as UID 0 (root)",
          "tone": "accent"
        }
      ],
      [
        "audit",
        "doc",
        805,
        42,
        130,
        74,
        "auth.log",
        {
          "sub": "COMMAND audited",
          "tone": "ok"
        }
      ],
      [
        "term",
        "term",
        24,
        194,
        912,
        316,
        "Terminal · sudo & Ownership"
      ]
    ],
    "code": [
      "# 1. View file ownership (user and group columns)",
      "ls -l app/app.env",
      "# 2. Change file owner to oracle and group to oinstall",
      "chown oracle:oinstall app/app.env",
      "ls -l app/app.env",
      "# 3. Change ownership of an entire directory tree recursively (-R)",
      "chown -R oracle:oinstall app/",
      "# 4. Execute administrative command with sudo privileges",
      "sudo systemctl restart nginx"
    ],
    "codeTitle": "Bash · prod-db01",
    "steps": [
      {
        "say": "Production standard: root account se SSH login hamesha disable hota hai (`PermitRootLogin no`). Har engineer apne personal account se aakar `sudo` use karta hai.",
        "ops": [
          [
            "show",
            "usr",
            "fenv",
            "sudo",
            "rootcmd",
            "audit",
            "term"
          ],
          [
            "lock",
            "sudo"
          ],
          [
            "link",
            "usr",
            "sudo",
            {
              "tone": "accent"
            }
          ],
          [
            "link",
            "sudo",
            "rootcmd",
            {
              "tone": "proc"
            }
          ],
          [
            "link",
            "rootcmd",
            "audit",
            {
              "tone": "ok"
            }
          ]
        ],
        "vo": "प्रोडक्शन स्टैंडर्ड: रूट अकाउंट से एस-एस-एच लॉगिन हमेशा डिसेबल होता है। हर इंजीनियर अपने पर्सनल अकाउंट से आकर सूडो यूज़ करता है।"
      },
      {
        "say": "`ls -l` mein permissions ke baad do naam hote hain: pehla `owner` (user), doosra `group`. Yahan `app/app.env` ka owner check karo.",
        "code": [
          0,
          1
        ],
        "ops": [
          [
            "pulse",
            "fenv"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ ls -l app/app.env"
          ],
          [
            "out",
            "term",
            "-rw------- 1 oracle oinstall 80 Oct 29 10:15 app/app.env"
          ]
        ],
        "vo": "एल-एस डैश एल में परमिशन्स के बाद दो नाम होते हैं: पहला ओनर यानी यूज़र, दूसरा ग्रुप। यहाँ ऐप स्लैश ऐप डॉट ई-एन-वी का ओनर चेक करो।"
      },
      {
        "say": "Agar ownership badalni ho toh `chown user:group filename` use kiya jata hai. Colon `:` ke pehle user, baad mein group.",
        "code": [
          2,
          3,
          4
        ],
        "ops": [
          [
            "term",
            "term",
            "oracle@prod-db01:~$ chown oracle:oinstall app/app.env"
          ],
          [
            "flow",
            "usr",
            "fenv",
            "chown user:group",
            {
              "tone": "accent",
              "dur": 550
            }
          ],
          [
            "ok",
            "fenv"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ ls -l app/app.env"
          ],
          [
            "out",
            "term",
            "-rw------- 1 oracle oinstall 80 Oct 29 10:15 app/app.env"
          ]
        ],
        "vo": "अगर ओनरशिप बदलनी हो तो सी-एच-ओन यूज़र कोलन ग्रुप फ़ाइलनेम यूज़ किया जाता है। कोलन के पहले यूज़र, बाद में ग्रुप।"
      },
      {
        "say": "Poore application folder ke andar sabhi files aur sub-folders ki ownership ek saath update karne ke liye `-R` (recursive) flag lagaya jata hai.",
        "code": [
          5,
          6
        ],
        "ops": [
          [
            "term",
            "term",
            "oracle@prod-db01:~$ chown -R oracle:oinstall app/"
          ],
          [
            "label",
            "fenv",
            "app/ (Recursive -R)",
            "All files -> oracle:oinstall"
          ],
          [
            "tone",
            "fenv",
            "ok"
          ],
          [
            "pulse",
            "fenv"
          ]
        ],
        "vo": "पूरे एप्लिकेशन फ़ोल्डर के अंदर सभी फ़ाइल्स और सब-फ़ोल्डर्स की ओनरशिप एक साथ अपडेट करने के लिए डैश कैपिटल आर, यानी रिकर्सिव फ़्लैग, लगाया जाता है।"
      },
      {
        "say": "Services restart ya system package install karne ke liye aage `sudo` lagaya jata hai. Sudo command chalne par system audit log mein entry ho jati hai.",
        "code": [
          7,
          8
        ],
        "ops": [
          [
            "term",
            "term",
            "oracle@prod-db01:~$ sudo systemctl restart nginx"
          ],
          [
            "unlock",
            "sudo"
          ],
          [
            "flow",
            "usr",
            "sudo",
            "sudo",
            {
              "tone": "accent",
              "dur": 450
            }
          ],
          [
            "flow",
            "sudo",
            "rootcmd",
            "verified!",
            {
              "tone": "ok",
              "dur": 500
            }
          ],
          [
            "flow",
            "rootcmd",
            "audit",
            "audit trail",
            {
              "tone": "proc",
              "dur": 500
            }
          ],
          [
            "ok",
            "rootcmd"
          ],
          [
            "ok",
            "audit"
          ]
        ],
        "vo": "सर्विसेज़ रीस्टार्ट या सिस्टम पैकेज इंस्टॉल करने के लिए आगे सूडो लगाया जाता है। सूडो कमांड चलने पर सिस्टम ऑडिट लॉग में एंट्री हो जाती है।"
      }
    ],
    "points": [
      "`chown user:group file` = file ka owner aur group dono set karo.",
      "`chown -R user:group dir/` = recursive ownership change.",
      "`sudo cmd` = elevated root privileges ke sath specific command execute karo.",
      "Sudo audit log banata hai, isliye enterprise production mein har action accountable hota hai."
    ],
    "check": {
      "q": "Direct root login karne ke bajaye apne user se login karke `sudo` use karna production industry standard kyun hai?",
      "a": [
        "Kyunki sudo se command jaldi chalti hai.",
        "Kyunki sudo har action ko username aur timestamp ke sath audit log mein record karta hai aur accountability rehti hai.",
        "Kyunki root login Linux mein illegal hai.",
        "Kyunki sudo chalane par password nahi lagta."
      ],
      "c": 1,
      "why": "Accountability aur compliance: agar 5 engineers hain aur koi server reboot kare, toh root login par pata nahi chalta kisne kiya. `sudo` par log banta hai ki \"john ne 10:14 par reboot chalaya\"."
    },
    "syntax": {
      "code": "chown <user> <file>              # Change owner\nchown <user>:<group> <file>      # Change owner and group\nchown -R <user>:<group> <dir>/   # Recursive\nsudo <command>                   # Run as superuser\nsudo -i                          # Switch to root shell",
      "parts": [
        [
          "chown user:group",
          "Assign owner and group simultaneously."
        ],
        [
          "-R",
          "Apply recursively to all contents of directory."
        ],
        [
          "sudo",
          "Execute with root authority according to sudoers policy."
        ]
      ]
    },
    "scenario": "Web deployment ke baad Nginx ne `403 Forbidden` dena shuru kar diya. Troubleshoot karke pata chala ki nayi files root user se copy hui thi aur Nginx service unhe padh nahi pa rahi thi. Engineer ne `chown -R nginx:nginx /var/www/html` chalaya aur site instant live ho gayi.",
    "tasks": [
      {
        "t": "`app/app.env` file ki ownership `oracle:oinstall` par set karo (`chown`).",
        "sql": "chown oracle:oinstall app/app.env\nls -l app/app.env"
      },
      {
        "t": "Poore `app/` folder ki ownership recursively `oracle:oinstall` par update karo (`chown -R`).",
        "sql": "chown -R oracle:oinstall app/\nls -ld app/"
      },
      {
        "t": "`sudo systemctl restart nginx` chala kar web server restart karo.",
        "sql": "sudo systemctl restart nginx"
      }
    ],
    "mistakes": [
      {
        "bad": "chown user file.txt",
        "err": "group remained root",
        "why": "Sirf `chown user` karne se group purana hi reh jata hai. Hamesha `chown user:group` lagana achhi habit hai.",
        "fix": "chown user:group file.txt"
      },
      {
        "bad": "visudo bina use kiye vi /etc/sudoers",
        "err": "syntax error locked out root",
        "why": "`/etc/sudoers` ko direct editor se edit karne par agar ek comma galat hua, toh sudo hamesha ke liye toot jata hai. Hamesha `visudo` command use karo jo syntax check karti hai.",
        "fix": "sudo visudo"
      }
    ],
    "intro": "वी-आई-पी लॉकर रूम सोचो। हर तिजोरी का एक मालिक है, यानी सी-एच-ओन। अगर तुम नॉर्मल एम्प्लॉई हो पर सर्वर रीबूट करना है, तो तुम डायरेक्ट रूट नहीं बनते; तुम सिक्योरिटी गार्ड को अपना आई-डी कार्ड दिखा कर सूडो बोलते हो। गार्ड अटेंडेंस बुक में लिखता है कि तुमने क्या किया और इजाज़त देता है।"
  },
  {
    "id": "lx-ps-kill",
    "course": "linux",
    "sec": "Process Management aur System Monitoring",
    "title": "ps aux, kill -9 aur pkill: Rogue processes khatam karna",
    "url": "https://man7.org/linux/man-pages/man1/ps.1.html",
    "meta": "Linux · prod-db01 · bash",
    "summary": "Production servers par process tracking: PID, PPID, user, CPU%, memory%. Running processes dhoondhna `ps aux | grep payapi`, graceful stop `kill -15 (SIGTERM)`, forceful kill `kill -9 (SIGKILL)`, aur process name se terminate karna `pkill`.",
    "simple": "Hospital emergency room socho. Har patient ka ek token number (PID) hai. Doctor screen par dekhta hai kaun sa patient (process) zyada oxygen (CPU) le raha hai. Nurse pehle pyaar se discharge karti hai (`kill -15`). Agar patient zidd par ade aur machine jam kar de, toh security guard force se bahar nikaal deta hai (`kill -9`).",
    "words": [
      [
        "PID",
        "Process ID: Har running program ka unique numeric identifier."
      ],
      [
        "PPID",
        "Parent Process ID: Jis process ne is program ko start kiya."
      ],
      [
        "ps aux",
        "System ke har user ke saare active processes ki poori report."
      ],
      [
        "SIGTERM (15)",
        "Graceful exit: Program ko data save karke clean tarike se band hone ka request."
      ],
      [
        "SIGKILL (9)",
        "Immediate kill: Kernel level par bina koi sawal poochhe process ko foran khatam karna."
      ],
      [
        "kill -9 <PID>",
        "Force kill specific PID."
      ],
      [
        "pkill <name>",
        "Process ke naam se direct kill signal bhejna."
      ]
    ],
    "nodes": [
      [
        "ptbl",
        "table",
        24,
        38,
        530,
        154,
        "Running Processes (ps aux)",
        {
          "cols": [
            "USER",
            "PID",
            "%CPU",
            "%MEM",
            "COMMAND"
          ],
          "cw": [
            0.16,
            0.12,
            0.14,
            0.14,
            0.44
          ]
        }
      ],
      [
        "cpum",
        "meter",
        580,
        42,
        356,
        22,
        "Server CPU Load",
        {
          "sub": "88.4% (Hung Process!)",
          "level": 0.89,
          "tone": "danger"
        }
      ],
      [
        "sig15",
        "proc",
        580,
        82,
        170,
        48,
        "kill -15 (SIGTERM)",
        {
          "sub": "1st: Graceful stop",
          "tone": "accent"
        }
      ],
      [
        "sig9",
        "proc",
        766,
        82,
        170,
        48,
        "kill -9 (SIGKILL)",
        {
          "sub": "2nd: Force kill",
          "tone": "danger"
        }
      ],
      [
        "status",
        "chip",
        580,
        148,
        356,
        30,
        "PID 1420 (payapi.jar) eating 88.4% CPU!",
        {
          "tone": "danger"
        }
      ],
      [
        "term",
        "term",
        24,
        212,
        912,
        298,
        "Terminal · Process Management"
      ]
    ],
    "code": [
      "# 1. Find the rogue process and note its PID",
      "ps aux | grep payapi",
      "# 2. Attempt graceful termination (SIGTERM 15)",
      "kill -15 1420",
      "# 3. If hung or unresponsive, force terminate immediately (SIGKILL 9)",
      "kill -9 1420",
      "# 4. Check if process is gone",
      "ps aux | grep payapi",
      "# 5. Kill by process name pattern using pkill",
      "pkill -f node"
    ],
    "codeTitle": "Bash · prod-db01",
    "steps": [
      {
        "say": "Production server par CPU spike ho jaye ya koi API hang ho jaye, toh sabse pehle us process ka PID dhoondha jata hai `ps aux | grep <name>`.",
        "ops": [
          [
            "show",
            "ptbl",
            "cpum",
            "status",
            "term"
          ],
          [
            "rows",
            "ptbl",
            [
              [
                "root",
                "1",
                "0.1",
                "0.2",
                "/sbin/init (systemd)"
              ],
              [
                "root",
                "1102",
                "0.3",
                "0.8",
                "nginx: master process"
              ],
              [
                "appuser",
                "1420",
                "88.4",
                "6.2",
                "java -jar /opt/payapi.jar"
              ],
              [
                "oracle",
                "1980",
                "0.5",
                "1.1",
                "node worker.js"
              ]
            ]
          ]
        ],
        "vo": "प्रोडक्शन सर्वर पर सी-पी-यू स्पाइक हो जाए या कोई ए-पी-आई हैंग हो जाए, तो सबसे पहले उस प्रोसेस का पी-आई-डी ढूँढा जाता है, पी-एस ए-यू-एक्स पाइप ग्रेप नेम।"
      },
      {
        "say": "PID 1420 dhoondho. Output mein user, PID, %CPU, %MEM aur exact startup command milti hai.",
        "code": [
          0,
          1
        ],
        "ops": [
          [
            "mark",
            "ptbl",
            [
              2
            ],
            "danger"
          ],
          [
            "colhl",
            "ptbl",
            [
              1,
              2
            ],
            "danger"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ ps aux | grep payapi"
          ],
          [
            "out",
            "term",
            "appuser   1420 88.4  6.2 1420480 512000 ?     Rl   09:15  12:40 /usr/bin/java -jar /opt/payapi.jar",
            "oracle    2401  0.0  0.0   6480   890 pts/0    S+   10:30   0:00 grep payapi"
          ]
        ],
        "vo": "पी-आई-डी फोर्टीन-ट्वेंटी ढूँढो। आउटपुट में यूज़र, पी-आई-डी, सी-पी-यू परसेंट, मेमोरी परसेंट और एग्ज़ैक्ट स्टार्टअप कमांड मिलती है।"
      },
      {
        "say": "Production Rule #1: Hamesha pehle `kill -15 <PID>` (SIGTERM) bhejo taaki database connections close ho sakein aur logs write ho sakein.",
        "code": [
          2,
          3
        ],
        "ops": [
          [
            "show",
            "sig15"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ kill -15 1420"
          ],
          [
            "flow",
            "sig15",
            "ptbl#2",
            "SIGTERM (-15)",
            {
              "tone": "accent",
              "dur": 600
            }
          ],
          [
            "label",
            "status",
            "SIGTERM sent... process still hung!"
          ]
        ],
        "vo": "प्रोडक्शन रूल नंबर वन: हमेशा पहले किल डैश फिफ्टीन पी-आई-डी यानी सिग-टर्म भेजो ताकि डेटाबेस कनेक्शन्स क्लोज़ हो सकें और लॉग्स राइट हो सकें।"
      },
      {
        "say": "Agar 10 second baad bhi process unresponsive ho aur band na ho, tab aakhri hathiyar chalao: `kill -9 <PID>` (SIGKILL).",
        "code": [
          4,
          5
        ],
        "ops": [
          [
            "show",
            "sig9"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ kill -9 1420"
          ],
          [
            "flow",
            "sig9",
            "ptbl#2",
            "SIGKILL (-9)!",
            {
              "tone": "danger",
              "dur": 600
            }
          ],
          [
            "delrow",
            "ptbl",
            [
              2
            ]
          ],
          [
            "colhl",
            "ptbl",
            []
          ],
          [
            "level",
            "cpum",
            0.08
          ],
          [
            "tone",
            "cpum",
            "ok"
          ],
          [
            "label",
            "cpum",
            "Server CPU Load",
            "8% (Healthy)"
          ],
          [
            "label",
            "status",
            "PID 1420 Terminated · CPU & RAM Freed!"
          ],
          [
            "tone",
            "status",
            "ok"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ ps aux | grep payapi"
          ],
          [
            "out",
            "term",
            "oracle    2405  0.0  0.0   6480   890 pts/0    S+   10:31   0:00 grep payapi"
          ]
        ],
        "vo": "अगर दस सेकंड बाद भी प्रोसेस अनरिस्पॉन्सिव हो और बंद न हो, तब आख़िरी हथियार चलाओ: किल डैश नाइन पी-आई-डी यानी सिग-किल।"
      },
      {
        "say": "Agar 20 processes ek hi naam ke hain (jaise 20 python workers), toh PID ek ek karke daalne ke bajaye `pkill -f node` ya `killall` use kiya jata hai.",
        "code": [
          6,
          7
        ],
        "ops": [
          [
            "term",
            "term",
            "oracle@prod-db01:~$ pkill -f node"
          ],
          [
            "delrow",
            "ptbl",
            [
              2
            ]
          ],
          [
            "ok",
            "sig9"
          ]
        ],
        "vo": "अगर बीस प्रोसेसेज़ एक ही नाम के हैं, जैसे बीस पाइथन वर्कर्स, तो पी-आई-डी एक-एक करके डालने के बजाय पी-किल डैश एफ़ नोड या किल-ऑल यूज़ किया जाता है।"
      }
    ],
    "points": [
      "`ps aux | grep <name>` = process ka PID aur CPU/memory consumption check karo.",
      "`kill -15 <PID>` = standard graceful termination signal (SIGTERM).",
      "`kill -9 <PID>` = uncatchable forceful termination (SIGKILL) - kernel closes it immediately.",
      "`pkill <name>` = process name ke pattern par matching processes kill karo."
    ],
    "check": {
      "q": "Production database ya backend API ko stop karte waqt pehle `kill -15` (SIGTERM) dena kyun zaroori hota hai seedha `kill -9` dene ke bajaye?",
      "a": [
        "Kyunki kill -9 Linux mein exist nahi karta.",
        "Kyunki kill -15 application ko open transactions commit karne, temp files delete karne aur clean shutdown karne ka mauka deta hai.",
        "Kyunki kill -15 fast chalta hai.",
        "Kyunki kill -9 se server reboot ho jata hai."
      ],
      "c": 1,
      "why": "`kill -9` process ko koi mauka diye bina kernel level par foran khatam karta hai, jisse database data files corrupt hone ya lock files bache rehne ka khatra hota hai."
    },
    "syntax": {
      "code": "ps aux | grep <name>    # Find process and PID\nkill -15 <PID>          # Graceful shutdown (SIGTERM)\nkill -9 <PID>           # Force kill (SIGKILL)\npkill -f <pattern>      # Kill matching process names\nkillall <binary_name>   # Kill all instances by exact name",
      "parts": [
        [
          "aux",
          "a=all users, u=user-oriented format, x=include processes without terminal."
        ],
        [
          "-15",
          "Signal 15 (SIGTERM): politely asks process to exit."
        ],
        [
          "-9",
          "Signal 9 (SIGKILL): unblockable forced kill by kernel."
        ],
        [
          "pkill",
          "Sends signals based on process name matching."
        ]
      ]
    },
    "scenario": "Black Friday sale ke dauran payment gateway microservice hang ho gayi aur usne 100% CPU lock kar liya. Naye transactions fail ho rahe the. DevOps engineer ne `ps aux | grep payapi` se PID 1420 dekha, `kill -9 1420` chalaya aur service restart kar di. System 30 second mein normal ho gaya.",
    "tasks": [
      {
        "t": "System par `payapi` process ko dhoondho aur uska PID check karo (`ps aux | grep`).",
        "sql": "ps aux | grep payapi"
      },
      {
        "t": "PID 1420 ko graceful SIGTERM signal bhejo (`kill -15`).",
        "sql": "kill -15 1420"
      },
      {
        "t": "PID 1420 ko forceful SIGKILL se foran terminate karo (`kill -9`).",
        "sql": "kill -9 1420"
      }
    ],
    "mistakes": [
      {
        "bad": "kill 9 1420",
        "err": "killed PID 9 and PID 1420!",
        "why": "Hyphen `-` miss hone se 9 signal nahi balki PID 9 ban gaya! Hamesha `kill -9 <PID>` likho.",
        "fix": "kill -9 1420"
      },
      {
        "bad": "kill -9 $(pgrep oracle)",
        "err": "database crashed ungracefully",
        "why": "Production DB processes (Oracle, Postgres) ko bina soche samjhe kill -9 karne se crash recovery chalani padti hai. Hamesha database shutdown commands use karo.",
        "fix": "sqlplus / as sysdba -> shutdown immediate"
      }
    ],
    "intro": "हॉस्पिटल इमरजेंसी रूम सोचो। हर पेशेंट का एक टोकन नंबर यानी पी-आई-डी है। डॉक्टर स्क्रीन पर देखता है कौनसा पेशेंट ज़्यादा ऑक्सीजन यानी सी-पी-यू ले रहा है। नर्स पहले प्यार से डिस्चार्ज करती है, यानी किल डैश फिफ्टीन। अगर पेशेंट ज़िद पर अड़े और मशीन जाम कर दे, तो सिक्योरिटी गार्ड फ़ोर्स से बाहर निकाल देता है, यानी किल डैश नाइन।"
  },
  {
    "id": "lx-bg-nohup",
    "course": "linux",
    "sec": "Process Management aur System Monitoring",
    "title": "Background Jobs: &, nohup, jobs, fg aur tmux",
    "url": "https://man7.org/linux/man-pages/man1/nohup.1.html",
    "meta": "Linux · prod-db01 · bash",
    "summary": "Long-running tasks aur SSH disconnection se bachav: command ke pichhe `&` lagana, `SIGHUP` (hangup signal) ko block karna `nohup ./backup.sh &`, active jobs dekhna `jobs`, foreground mein wapas lana `fg`, aur terminal multiplexer `tmux`.",
    "simple": "Tum laptop par SSH se 4 ghante ka database backup chala rahe ho. Achanak Wi-Fi disconnect ho gaya ya laptop ki battery khatam ho gayi. Normal command usi waqt mar jayegi! Par agar `nohup ... &` laga kar chalaya tha, toh server background mein bina laptop ke bhi poora backup complete karega.",
    "words": [
      [
        "SIGHUP",
        "Signal Hangup: Terminal window band hone par kernel saare child processes ko maarne ke liye yeh signal bhejta hai."
      ],
      [
        "& (Ampersand)",
        "Command ko background mein start karke terminal prompt foran wapas deta hai."
      ],
      [
        "nohup",
        "No Hang Up: Program ko SIGHUP signal ignore karne ka instruction deta hai."
      ],
      [
        "jobs",
        "Current terminal session ke background jobs ki list."
      ],
      [
        "fg %1",
        "Background job number 1 ko wapas screen ke saamne (foreground) lana."
      ],
      [
        "Ctrl + Z",
        "Running program ko pause/freeze karke background bhejna."
      ],
      [
        "bg",
        "Paused job ko background mein run hone dena."
      ],
      [
        "tmux",
        "Terminal session manager jisme terminal detach karke baad mein reconnect kiya ja sakta hai."
      ]
    ],
    "nodes": [
      [
        "ssh",
        "box",
        24,
        48,
        175,
        68,
        "SSH Session (pts/0)",
        {
          "sub": "Laptop connection",
          "tone": "accent"
        }
      ],
      [
        "hup",
        "proc",
        240,
        56,
        145,
        52,
        "SIGHUP Signal",
        {
          "sub": "WiFi / SSH drop!",
          "tone": "danger"
        }
      ],
      [
        "nohup",
        "box",
        430,
        48,
        185,
        68,
        "nohup Shield",
        {
          "sub": "Blocks SIGHUP signal",
          "tone": "ok"
        }
      ],
      [
        "job",
        "proc",
        660,
        34,
        276,
        52,
        "backup_db.sh & (PID 2460)",
        {
          "sub": "Background worker",
          "tone": "proc"
        }
      ],
      [
        "log",
        "doc",
        680,
        106,
        236,
        58,
        "/var/log/oracle/backup.log",
        {
          "sub": "> backup.log 2>&1",
          "tone": "file"
        }
      ],
      [
        "term",
        "term",
        24,
        198,
        912,
        312,
        "Terminal · Background Jobs"
      ]
    ],
    "code": [
      "# 1. Start a long script in background with ampersand (&)",
      "./scripts/backup_db.sh &",
      "# 2. View current active jobs in this session",
      "jobs",
      "# 3. Bring job 1 back to foreground",
      "fg %1",
      "# 4. Golden DevOps Rule: Run disconnected from terminal with nohup",
      "nohup ./scripts/backup_db.sh > /var/log/oracle/backup.log 2>&1 &",
      "# 5. Verify process is actively running in background",
      "ps aux | grep backup_db"
    ],
    "codeTitle": "Bash · prod-db01",
    "steps": [
      {
        "say": "SSH par lamba script chalate waqt sabse bada dar: \"Agar mera internet gaya toh script aadhe mein toot jayega\". `nohup` aur `&` iska permanent solution hain.",
        "ops": [
          [
            "show",
            "ssh",
            "hup",
            "term"
          ],
          [
            "link",
            "ssh",
            "hup",
            {
              "tone": "danger",
              "label": "disconnect"
            }
          ]
        ],
        "vo": "एस-एस-एच पर लंबा स्क्रिप्ट चलाते वक़्त सबसे बड़ा डर: अगर मेरा इंटरनेट गया तो स्क्रिप्ट आधे में टूट जाएगा। नो-हप और एम्परसैंड इसका पर्मनेंट सॉल्यूशन हैं।"
      },
      {
        "say": "Command ke aakhir mein `&` lagao. Terminal tumhe Job Number `[1]` aur Process ID `2450` dega, aur prompt foran free ho jayega.",
        "code": [
          0,
          1
        ],
        "ops": [
          [
            "show",
            "job"
          ],
          [
            "link",
            "ssh",
            "job",
            {
              "label": "& (background)",
              "tone": "accent",
              "bend": -25
            }
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ ./scripts/backup_db.sh &"
          ],
          [
            "flow",
            "ssh",
            "job",
            "PID 2450",
            {
              "tone": "accent",
              "bend": -25,
              "dur": 550
            }
          ],
          [
            "out",
            "term",
            "[1] 2450"
          ]
        ],
        "vo": "कमांड के आख़िर में एम्परसैंड लगाओ। टर्मिनल तुम्हें जॉब नंबर वन और प्रोसेस आई-डी ट्वेंटी-फोर फिफ्टी देगा, और प्रॉम्प्ट फ़ौरन फ़्री हो जाएगा।"
      },
      {
        "say": "Session ke background jobs dekhne ke liye `jobs` type karo. Agar wapas screen par live output dekhna hai, toh `fg %1` chalao.",
        "code": [
          2,
          3,
          4,
          5
        ],
        "ops": [
          [
            "term",
            "term",
            "oracle@prod-db01:~$ jobs"
          ],
          [
            "out",
            "term",
            "[1]+  Running                 ./scripts/backup_db.sh &"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ fg %1"
          ],
          [
            "flow",
            "job",
            "ssh",
            "fg %1 (foreground)",
            {
              "tone": "proc",
              "bend": 25,
              "dur": 550
            }
          ],
          [
            "out",
            "term",
            "./scripts/backup_db.sh",
            "Backing up database tablespaces... [in progress]"
          ]
        ],
        "vo": "सेशन के बैकग्राउंड जॉब्स देखने के लिए जॉब्स टाइप करो। अगर वापस स्क्रीन पर लाइव आउटपुट देखना है, तो एफ़-जी परसेंट वन चलाओ।"
      },
      {
        "say": "Senior DevOps Formula: `nohup <cmd> > file.log 2>&1 &`. Isse: 1. Terminal band hone par bhi process chalega. 2. Output aur errors log file mein judenge. 3. Prompt foran free hoga.",
        "code": [
          6,
          7
        ],
        "ops": [
          [
            "show",
            "nohup",
            "log"
          ],
          [
            "lock",
            "nohup"
          ],
          [
            "link",
            "hup",
            "nohup",
            {
              "tone": "danger",
              "dash": 1
            }
          ],
          [
            "link",
            "nohup",
            "job",
            {
              "tone": "ok",
              "label": "immune"
            }
          ],
          [
            "link",
            "job",
            "log",
            {
              "tone": "file",
              "label": "2>&1"
            }
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ nohup ./scripts/backup_db.sh > /var/log/oracle/backup.log 2>&1 &"
          ],
          [
            "flow",
            "job",
            "log",
            "logging",
            {
              "tone": "ok",
              "dur": 550
            }
          ],
          [
            "out",
            "term",
            "[1] 2460"
          ],
          [
            "ok",
            "nohup"
          ],
          [
            "ok",
            "job"
          ]
        ],
        "vo": "सीनियर डेव-ऑप्स फ़ॉर्मूला: नो-हप कमांड ग्रेटर-दैन फ़ाइल डॉट लॉग टू ग्रेटर-दैन एम्परसैंड वन एम्परसैंड। इससे टर्मिनल बंद होने पर भी प्रोसेस चलेगा, आउटपुट और एरर्स लॉग फ़ाइल में जुड़ेंगे, और प्रॉम्प्ट फ़ौरन फ़्री होगा।"
      },
      {
        "say": "Terminal band karke naye laptop se aao, `ps aux | grep backup_db` se check karo. Script maze se background mein chal rahi hogi.",
        "code": [
          8,
          9
        ],
        "ops": [
          [
            "dim",
            "ssh"
          ],
          [
            "flow",
            "ssh",
            "hup",
            "SSH closed",
            {
              "tone": "danger",
              "dur": 450
            }
          ],
          [
            "x",
            "hup"
          ],
          [
            "pulse",
            "job"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ ps aux | grep backup_db"
          ],
          [
            "out",
            "term",
            "oracle    2460  1.2  0.4  18400  8400 ?        S    10:35   0:01 /bin/bash ./scripts/backup_db.sh"
          ],
          [
            "ok",
            "log"
          ]
        ],
        "vo": "टर्मिनल बंद करके नए लैपटॉप से आओ, पी-एस ए-यू-एक्स पाइप ग्रेप बैकअप डी-बी से चेक करो। स्क्रिप्ट मज़े से बैकग्राउंड में चल रही होगी।"
      }
    ],
    "points": [
      "`&` at end of command = runs process in background, frees terminal immediately.",
      "`nohup` = prevents process from getting killed when terminal/SSH disconnects.",
      "`jobs` = lists active background tasks in current shell.",
      "`fg %1` = brings job 1 to foreground.",
      "Modern production alternative: `tmux` (terminal session persists across disconnects)."
    ],
    "check": {
      "q": "Tumhe 6 ghante ka data migration script SSH terminal par chalana hai aur office se nikalna hai. Sabse safe command kaunsi hai?",
      "a": [
        "./migrate.sh",
        "./migrate.sh &",
        "nohup ./migrate.sh > /var/log/migrate.log 2>&1 &",
        "sudo ./migrate.sh"
      ],
      "c": 2,
      "why": "`nohup` SIGHUP disconnect signal ko block karta hai, `> ... 2>&1` saare logs save karta hai, aur `&` use background mein bhej deta hai. Laptop band hone par bhi migration chalegi."
    },
    "syntax": {
      "code": "cmd &                               # Run in background\nnohup cmd &                         # Run in background, immune to hangup\nnohup cmd > out.log 2>&1 &          # Production standard with logging\njobs                                # List background jobs\nfg %<job_id>                        # Bring to foreground\ntmux new -s mysession               # Persistent terminal session",
      "parts": [
        [
          "&",
          "Runs command asynchronously."
        ],
        [
          "nohup",
          "Ignores SIGHUP (hangup) signal."
        ],
        [
          "jobs",
          "Lists session jobs with job numbers."
        ],
        [
          "fg",
          "Moves background job to foreground."
        ]
      ]
    },
    "scenario": "Database administrator 500GB ka RMAN backup le raha tha. 90% par achanak VPN connection drop ho gaya. Normal script band ho jata aur 4 ghante barbaad ho jaate. Par script `nohup` ke zariye chal raha tha, isliye backup server par poora successfully finish hua.",
    "tasks": [
      {
        "t": "`scripts/backup_db.sh` ko background mein start karo (`&`).",
        "sql": "./scripts/backup_db.sh &"
      },
      {
        "t": "Current shell session ke running background jobs check karo (`jobs`).",
        "sql": "jobs"
      },
      {
        "t": "Script ko `nohup` aur redirection ke saath background mein chalao.",
        "sql": "nohup ./scripts/backup_db.sh > backup.log 2>&1 &\nps aux | grep backup_db"
      }
    ],
    "mistakes": [
      {
        "bad": "./script.sh & (aur foran terminal close kar diya)",
        "err": "process got terminated by SIGHUP",
        "why": "Sirf `&` lagane se terminal disconnect hone par bash shell child processes ko SIGHUP bhej kar maar deta hai. Disconnect se bachne ke liye `nohup` lagana zaroori hai.",
        "fix": "nohup ./script.sh > /dev/null 2>&1 &"
      },
      {
        "bad": "nohup ./script.sh (bina & ke)",
        "err": "terminal still blocked",
        "why": "`nohup` akele terminal prompt free nahi karta. Aakhir mein `&` lagana zaroori hai taaki prompt foran wapas mile.",
        "fix": "nohup ./script.sh &"
      }
    ],
    "intro": "तुम लैपटॉप पर एस-एस-एच से चार घंटे का डेटाबेस बैकअप चला रहे हो। अचानक वाई-फ़ाई डिस्कनेक्ट हो गया या लैपटॉप की बैटरी ख़त्म हो गई। नॉर्मल कमांड उसी वक़्त मर जाएगी! पर अगर नो-हप और एम्परसैंड लगा कर चलाया था, तो सर्वर बैकग्राउंड में बिना लैपटॉप के भी पूरा बैकअप कंप्लीट करेगा।"
  },
  {
    "id": "lx-top-free",
    "course": "linux",
    "sec": "Process Management aur System Monitoring",
    "title": "top, free -m aur vmstat: CPU aur RAM ka health check",
    "url": "https://man7.org/linux/man-pages/man1/top.1.html",
    "meta": "Linux · prod-db01 · bash",
    "summary": "Server slow hone par pehla 60-second triage: `top` (Load Average, %CPU, %wa iowait), `free -h` (used vs available memory - available is king!), `vmstat 1 5` (CPU context switches & disk queue), aur `uptime`.",
    "simple": "Doctor ke clinic ka monitor socho: BP, Heart Rate, Oxygen. Linux server par `uptime` = patient ka temp. `top` = heart rate (CPU). `free -m` = oxygen cylinder (RAM). Aur `%wa (IO Wait)` = check karta hai ki kya hard drive jam hone ki wajah se poora server freeze hai.",
    "words": [
      [
        "Load Average",
        "1, 5, 15 minute ka running/waiting tasks average (CPU cores se compare kiya jata hai)."
      ],
      [
        "%wa (IO Wait)",
        "CPU hard disk se data aane ka intezar kar raha hai (high wa = slow disk bottleneck)."
      ],
      [
        "free -h",
        "Memory report human-readable format (MB/GB) mein."
      ],
      [
        "available memory",
        "Linux ka sabse important memory metric: Naye apps ke liye kitni RAM foran di ja sakti hai."
      ],
      [
        "buff/cache",
        "Disk se padhi hui files jo Linux ne RAM mein rakhi hain (zarurat padne par instantly reclaim ho sakti hain)."
      ],
      [
        "Swap",
        "Disk ka wo hissa jo RAM bharne par emergency memory banta hai (agar swap bhare toh server slow ho jata hai)."
      ],
      [
        "vmstat",
        "Virtual memory, disk, CPU activity ka continuous real-time stream."
      ]
    ],
    "nodes": [
      [
        "mload",
        "meter",
        24,
        42,
        430,
        22,
        "CPU Load Average (4 Xeon Cores)",
        {
          "sub": "0.28, 0.42, 0.35 (7% Busy)",
          "level": 0.07,
          "tone": "ok"
        }
      ],
      [
        "mram",
        "meter",
        24,
        102,
        430,
        22,
        "RAM Used by Apps",
        {
          "sub": "4.2 GiB / 15 GiB",
          "level": 0.28,
          "tone": "accent"
        }
      ],
      [
        "mcache",
        "meter",
        24,
        162,
        430,
        22,
        "Linux Page Cache (buff/cache)",
        {
          "sub": "7.1 GiB (Reclaimable)",
          "level": 0.47,
          "tone": "proc"
        }
      ],
      [
        "vavail",
        "var",
        490,
        36,
        210,
        56,
        "Available RAM (Gold Metric)",
        {
          "v": "11.2 GiB Free",
          "tone": "ok"
        }
      ],
      [
        "vswap",
        "var",
        724,
        36,
        212,
        56,
        "Swap Usage (si / so)",
        {
          "v": "0 B / 4.0 GiB",
          "tone": "ok"
        }
      ],
      [
        "vwa",
        "var",
        490,
        118,
        210,
        56,
        "vmstat IO-Wait (wa)",
        {
          "v": "0% (Disk Healthy)",
          "tone": "ok"
        }
      ],
      [
        "vcpu",
        "var",
        724,
        118,
        212,
        56,
        "Architecture (lscpu)",
        {
          "v": "4 Cores · x86_64",
          "tone": "accent"
        }
      ],
      [
        "term",
        "term",
        24,
        206,
        912,
        304,
        "Terminal · System Health Dashboard"
      ]
    ],
    "code": [
      "# 1. Check quick server load and uptime",
      "uptime",
      "# 2. Check memory usage in megabytes (free -m)",
      "free -m",
      "# 3. Check memory in human-readable gigabytes (free -h)",
      "free -h",
      "# 4. View virtual memory stats: run 2 updates every 1 second",
      "vmstat 1 2",
      "# 5. Check CPU architecture and core count",
      "lscpu | head -n 8"
    ],
    "codeTitle": "Bash · prod-db01",
    "steps": [
      {
        "say": "Client bolta hai: \"Application bohot slow chal rahi hai\". Pehla kaam: `uptime` chala kar Load Average check karo.",
        "ops": [
          [
            "show",
            "mload",
            "term"
          ],
          [
            "level",
            "mload",
            0.12
          ]
        ],
        "vo": "क्लाइंट बोलता है: एप्लिकेशन बहुत स्लो चल रही है। पहला काम: अपटाइम चला कर लोड एवरेज चेक करो।"
      },
      {
        "say": "`uptime` ke aakhir mein 3 numbers hote hain: 1 min, 5 min, 15 min ka load average. Agar 4 CPU cores hain aur load 10.0 hai, matlab server par bhari traffic jam hai.",
        "code": [
          0,
          1
        ],
        "ops": [
          [
            "pulse",
            "mload"
          ],
          [
            "label",
            "mload",
            "CPU Load Average (4 Cores)",
            "0.28 (1m) · 0.42 (5m) · 0.35 (15m) — Healthy"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ uptime"
          ],
          [
            "out",
            "term",
            " 10:40:02 up 14 days,  2 users,  load average: 0.28, 0.42, 0.35"
          ]
        ],
        "vo": "अपटाइम के आख़िर में तीन नंबर्स होते हैं: एक मिनट, पाँच मिनट, पंद्रह मिनट का लोड एवरेज। अगर चार सी-पी-यू कोर्ज़ हैं और लोड टेन पॉइंट ज़ीरो है, मतलब सर्वर पर भारी ट्रैफ़िक जाम है।"
      },
      {
        "say": "Linux Interview Question #1: \"free memory kam hai par server fast chal raha hai, kyun?\". Jawad: Linux khaali RAM ko disk cache (`buff/cache`) mein use karta hai!",
        "code": [
          2,
          3,
          4,
          5
        ],
        "ops": [
          [
            "show",
            "mram",
            "mcache",
            "vavail",
            "vswap"
          ],
          [
            "level",
            "mram",
            0.28
          ],
          [
            "level",
            "mcache",
            0.47
          ],
          [
            "val",
            "vavail",
            "11 GiB Available",
            {
              "tone": "ok"
            }
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ free -h"
          ],
          [
            "out",
            "term",
            "               total        used        free      shared  buff/cache   available",
            "Mem:            15Gi       4.2Gi       4.5Gi       256Mi       7.1Gi        11Gi",
            "Swap:          4.0Gi          0B       4.0Gi"
          ]
        ],
        "vo": "लिनक्स इंटरव्यू क्वेश्चन नंबर वन: फ़्री मेमोरी कम है पर सर्वर फ़ास्ट चल रहा है, क्यों? जवाब: लिनक्स खाली रैम को डिस्क कैश, यानी बफ़ स्लैश कैश, में यूज़ करता है!"
      },
      {
        "say": "Gold Metric: Kabhi `free` column mat dekho! Hamesha aakhri column `available` dekho. Yeh batata hai ki apps ke liye real kitni RAM bachi hai.",
        "code": [
          6,
          7
        ],
        "ops": [
          [
            "show",
            "vwa"
          ],
          [
            "val",
            "vwa",
            "wa = 0% · id = 97%",
            {
              "tone": "ok"
            }
          ],
          [
            "pulse",
            "vavail"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ vmstat 1 2"
          ],
          [
            "out",
            "term",
            "procs -----------memory---------- ---swap-- -----io---- -system-- ------cpu-----",
            " r  b   swpd   free   buff  cache   si   so    bi    bo   in   cs us sy id wa st",
            " 0  0      0 4718592 262144 7444889    0    0     4    12   50   80  4  2 94  0  0",
            " 0  0      0 4718592 262144 7444889    0    0     0     0  210  420  2  1 97  0  0"
          ]
        ],
        "vo": "गोल्ड मेट्रिक: कभी फ़्री कॉलम मत देखो! हमेशा आख़िरी कॉलम अवेलेबल देखो। ये बताता है कि ऐप्स के लिए रियल कितनी रैम बची है।"
      },
      {
        "say": "`vmstat` mein `wa` column dekho: agar `wa` (IO Wait) 30-40% se upar ho, toh CPU nahi balki disk slow hai (database slow query ya disk bottleneck).",
        "code": [
          8,
          9
        ],
        "ops": [
          [
            "show",
            "vcpu"
          ],
          [
            "val",
            "vcpu",
            "4 Xeon Cores (x86_64)",
            {
              "tone": "ok"
            }
          ],
          [
            "ok",
            "vavail"
          ],
          [
            "ok",
            "vcpu"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ lscpu | head -n 8"
          ],
          [
            "out",
            "term",
            "Architecture:                    x86_64",
            "CPU op-mode(s):                  32-bit, 64-bit",
            "Address sizes:                   39 bits physical, 48 bits virtual",
            "Byte Order:                      Little Endian",
            "CPU(s):                          4",
            "On-line CPU(s) list:             0-3",
            "Vendor ID:                       GenuineIntel",
            "Model name:                      Intel(R) Xeon(R) Platinum"
          ]
        ],
        "vo": "वी-एम-स्टैट में डब्ल्यू-ए कॉलम देखो: अगर आई-ओ वेट तीस से चालीस परसेंट से ऊपर हो, तो सी-पी-यू नहीं बल्कि डिस्क स्लो है।"
      }
    ],
    "points": [
      "Load Average ko hamesha CPU core count se compare karo (4 cores par load < 4 normal hai).",
      "RAM health check karte waqt hamesha `available` column dekho, `free` nahi.",
      "`buff/cache` Linux ka smart disk caching feature hai jo zarurat padne par foran free ho jata hai.",
      "`%wa` (IO Wait) high hona disk bottleneck ki nishani hai."
    ],
    "check": {
      "q": "Tumne `free -h` chalaya. Total RAM 16G hai, `free` sirf 500M dikha raha hai, lekin `available` 10G dikha raha hai. Kya server out of memory hai?",
      "a": [
        "Haan, server crash hone wala hai.",
        "Nahi, bilkul normal hai! Linux ne 9.5G RAM disk caching (buff/cache) ke liye use ki hai jo zaroorat aane par foran mil jayegi.",
        "Haan, memory leak ho gaya hai.",
        "Server ko foran reboot karna padega."
      ],
      "c": 1,
      "why": "Linux mein \"free memory is wasted memory\" philosophy hoti hai. Linux khaali RAM ko disk cache bana deta hai taaki reads fast hon. Asli bachi hui RAM `available` column se dekhi jaati hai."
    },
    "syntax": {
      "code": "uptime               # Load average: 1, 5, 15 min\nfree -h              # Human-readable memory (GB/MB)\nvmstat 1 5           # 5 updates every 1 second\nlscpu                # CPU architecture and cores\ntop                  # Real-time interactive process manager",
      "parts": [
        [
          "free -h",
          "-h displays in MiB/GiB."
        ],
        [
          "available",
          "Actual memory ready for new applications."
        ],
        [
          "wa",
          "Percentage of time CPU was waiting for disk I/O."
        ],
        [
          "si / so",
          "Swap In / Swap Out rates (non-zero means memory paging thrashing)."
        ]
      ]
    },
    "scenario": "Database achanak freeze hone laga. Junior admin ne bola CPU 100% hai. Senior DBA ne `vmstat 1 3` dekha aur notice kiya ki `%wa` 85% tha aur CPU idle `id` 10% tha. Problem CPU nahi balki ek unindexed query thi jo 500GB disk scan kar rahi thi.",
    "tasks": [
      {
        "t": "System uptime aur load average inspect karo (`uptime`).",
        "sql": "uptime"
      },
      {
        "t": "Memory usage human-readable format mein check karo (`free -h`).",
        "sql": "free -h"
      },
      {
        "t": "Virtual memory statistics ke 2 samples 1 second interval par run karo (`vmstat 1 2`).",
        "sql": "vmstat 1 2"
      }
    ],
    "mistakes": [
      {
        "bad": "echo 3 > /proc/sys/vm/drop_caches (in production)",
        "err": "cache wiped, disk thrashing spike",
        "why": "Memory \"khaali\" karne ke chakkar mein drop_caches chalane se disk cache ud jata hai aur agle 10 minute tak saari apps disk par gir kar slow ho jaati hain. Linux memory ko khud handle karne do.",
        "fix": "available memory check karo (free -h)"
      },
      {
        "bad": "free bina -m ya -h ke",
        "err": "raw bytes confusion",
        "why": "Bina unit ke numbers bytes mein aate hain jisse count karna mushkil hota hai. Hamesha `free -h` ya `free -m` use karo.",
        "fix": "free -h"
      }
    ],
    "intro": "डॉक्टर के क्लिनिक का मॉनिटर सोचो: बी-पी, हार्ट रेट, ऑक्सीजन। लिनक्स सर्वर पर अपटाइम बराबर पेशेंट का टेम्परेचर। टॉप बराबर हार्ट रेट यानी सी-पी-यू। फ़्री डैश एम बराबर ऑक्सीजन सिलेंडर यानी रैम। और आई-ओ वेट चेक करता है कि क्या हार्ड ड्राइव जाम होने की वजह से पूरा सर्वर फ़्रीज़ है।"
  },
  {
    "id": "lx-systemd",
    "course": "linux",
    "sec": "Process Management aur System Monitoring",
    "title": "systemctl aur journalctl: Production services control",
    "url": "https://www.freedesktop.org/software/systemd/man/systemctl.html",
    "meta": "Linux · prod-db01 · bash",
    "summary": "Modern Linux ka init system aur service manager `systemd`: `systemctl status/start/stop/restart/reload/enable/disable`, service definition files `/etc/systemd/system/`, centralized binary logs dekhna `journalctl -u payapi.service -f --since \"1 hour ago\"`.",
    "simple": "Building ka central power control room socho. Har service (Nginx web server, PayAPI backend, Oracle DB, SSH) ka ek master switch hai (`systemctl`). `enable` bolta hai \"Jab bhi generator (server reboot) shuru ho, yeh switch automatically ON kar dena\". Aur `journalctl` = black box flight recorder jo har service ka log rakhta hai.",
    "words": [
      [
        "systemd",
        "Linux ka PID 1 master init process jo saari services ko start aur monitor karta hai."
      ],
      [
        "systemctl",
        "Services ko start, stop, restart aur status check karne ka CLI tool."
      ],
      [
        "enable / disable",
        "Server boot hote waqt service automatically start ho ya nahi yeh decide karna."
      ],
      [
        "reload",
        "Service ko bina band kiye (zero downtime) naya configuration load karwana."
      ],
      [
        "journalctl",
        "Systemd ka centralized logging utility."
      ],
      [
        "journalctl -f",
        "Follow: Logs ko real-time live scroll hota dekhna (like tail -f)."
      ],
      [
        "unit file",
        "Service configuration file (jaise `/etc/systemd/system/payapi.service`)."
      ]
    ],
    "nodes": [
      [
        "init",
        "proc",
        24,
        72,
        165,
        54,
        "systemd (PID 1)",
        {
          "sub": "Service Manager",
          "tone": "accent"
        }
      ],
      [
        "nginx",
        "box",
        245,
        32,
        200,
        56,
        "nginx.service",
        {
          "sub": "Active: active (running)",
          "tone": "ok"
        }
      ],
      [
        "payapi",
        "box",
        245,
        110,
        200,
        56,
        "payapi.service",
        {
          "sub": "Active: failed (exit-code)",
          "tone": "danger"
        }
      ],
      [
        "jrn",
        "doc",
        505,
        98,
        200,
        74,
        "journalctl -u payapi",
        {
          "sub": "SqlException: Refused",
          "tone": "proc"
        }
      ],
      [
        "boot",
        "disk",
        760,
        62,
        160,
        74,
        "systemctl enable",
        {
          "sub": "multi-user.target",
          "inside": "Boot Symlink",
          "tone": "ok",
          "level": 0.65
        }
      ],
      [
        "term",
        "term",
        24,
        206,
        912,
        304,
        "Terminal · systemd Controller"
      ]
    ],
    "code": [
      "# 1. Check health status of nginx web server",
      "systemctl status nginx",
      "# 2. Check health status of failed payapi backend service",
      "systemctl status payapi",
      "# 3. Start or restart service",
      "sudo systemctl start payapi",
      "# 4. View live logs of service using journalctl",
      "journalctl -u payapi -n 5",
      "# 5. Enable service to survive server reboots",
      "sudo systemctl enable payapi"
    ],
    "codeTitle": "Bash · prod-db01",
    "steps": [
      {
        "say": "RedHat, Ubuntu, Debian sabhi modern Linux par services `systemd` se manage hoti hain. Status check karne ke liye `systemctl status <service>` chalao.",
        "ops": [
          [
            "show",
            "init",
            "nginx",
            "payapi",
            "term"
          ],
          [
            "link",
            "init",
            "nginx",
            {
              "tone": "ok"
            }
          ],
          [
            "link",
            "init",
            "payapi",
            {
              "tone": "danger"
            }
          ]
        ],
        "vo": "रेड-हैट, उबंटू, डेबियन सभी मॉडर्न लिनक्स पर सर्विसेज़ सिस्टम-डी से मैनेज होती हैं। स्टेटस चेक करने के लिए सिस्टम-सी-टी-एल स्टेटस सर्विस चलाओ।"
      },
      {
        "say": "Nginx ka status dekho: `Active: active (running)` green light hai aur PID 1102 hai.",
        "code": [
          0,
          1
        ],
        "ops": [
          [
            "ok",
            "nginx"
          ],
          [
            "pulse",
            "nginx"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ systemctl status nginx"
          ],
          [
            "out",
            "term",
            "● nginx.service - A high performance web server and a reverse proxy server",
            "     Loaded: loaded (/lib/systemd/system/nginx.service; enabled; vendor preset: enabled)",
            "     Active: active (running) since Wed 2026-10-29 08:00:15 UTC; 2h 40min ago",
            "   Main PID: 1102 (nginx)"
          ]
        ],
        "vo": "इंजन-एक्स का स्टेटस देखो: एक्टिव रनिंग ग्रीन लाइट है और पी-आई-डी इलेवन ओ टू है।"
      },
      {
        "say": "Ab dekho `payapi`: yeh `failed` state mein hai! Production alert yahan trigger hota hai.",
        "code": [
          2,
          3
        ],
        "ops": [
          [
            "x",
            "payapi"
          ],
          [
            "pulse",
            "payapi"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ systemctl status payapi"
          ],
          [
            "out",
            "term",
            "● payapi.service - Payment Gateway REST API Microservice",
            "     Loaded: loaded (/etc/systemd/system/payapi.service; disabled; vendor preset: enabled)",
            "     Active: failed (Result: exit-code) since Wed 2026-10-29 09:20:14 UTC; 1h 20min ago",
            "    Process: 1420 ExecStart=/usr/bin/java -jar /opt/payapi.jar (code=exited, status=1/FAILURE)"
          ]
        ],
        "vo": "अब देखो पे-ए-पी-आई: ये फ़ेल्ड स्टेट में है! प्रोडक्शन अलर्ट यहाँ ट्रिगर होता है।"
      },
      {
        "say": "Kyun fail hua? Reason dhoondhne ke liye `journalctl -u payapi` chalao. Logs mein saaf dikhega: \"Connection refused to database\".",
        "code": [
          6,
          7
        ],
        "ops": [
          [
            "show",
            "jrn"
          ],
          [
            "link",
            "payapi",
            "jrn",
            {
              "tone": "proc",
              "label": "logs"
            }
          ],
          [
            "flow",
            "payapi",
            "jrn",
            "exit-code 1",
            {
              "tone": "danger",
              "dur": 550
            }
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ journalctl -u payapi -n 5"
          ],
          [
            "out",
            "term",
            "Oct 29 09:20:12 prod-db01 payapi[1420]: Starting Payment Gateway Service v2.4.0...",
            "Oct 29 09:20:14 prod-db01 payapi[1420]: ERROR org.hibernate.engine.jdbc.spi.SqlExceptionHelper - Connection refused",
            "Oct 29 09:20:14 prod-db01 payapi[1420]: Application failed to start: Database cluster unreachable",
            "Oct 29 09:20:14 prod-db01 systemd[1]: payapi.service: Main process exited, code=exited, status=1/FAILURE",
            "Oct 29 09:20:14 prod-db01 systemd[1]: payapi.service: Failed with result 'exit-code'."
          ]
        ],
        "vo": "क्यों फ़ेल हुआ? रीज़न ढूँढने के लिए जर्नल-सी-टी-एल डैश यू पे-ए-पी-आई चलाओ। लॉग्स में साफ़ दिखेगा: कनेक्शन रिफ़्यूज़्ड टू डेटाबेस।"
      },
      {
        "say": "Service start karne ke baad `systemctl enable payapi` zaroor chalao! Agar enable nahi kiya, toh agle server reboot par service band reh jayegi.",
        "code": [
          4,
          5,
          8,
          9
        ],
        "ops": [
          [
            "show",
            "boot"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ sudo systemctl start payapi"
          ],
          [
            "unx",
            "payapi"
          ],
          [
            "tone",
            "payapi",
            "ok"
          ],
          [
            "label",
            "payapi",
            "payapi.service",
            "Active: active (running) · PID 2850"
          ],
          [
            "ok",
            "payapi"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ sudo systemctl enable payapi"
          ],
          [
            "link",
            "payapi",
            "boot",
            {
              "label": "enable",
              "tone": "ok"
            }
          ],
          [
            "flow",
            "payapi",
            "boot",
            "symlink",
            {
              "tone": "ok",
              "dur": 550
            }
          ],
          [
            "out",
            "term",
            "Created symlink /etc/systemd/system/multi-user.target.wants/payapi.service → /etc/systemd/system/payapi.service."
          ],
          [
            "ok",
            "boot"
          ]
        ],
        "vo": "सर्विस स्टार्ट करने के बाद सिस्टम-सी-टी-एल इनेबल पे-ए-पी-आई ज़रूर चलाओ! अगर इनेबल नहीं किया, तो अगले सर्वर रीबूट पर सर्विस बंद रह जाएगी।"
      }
    ],
    "points": [
      "`systemctl status <service>` = health, PID aur recent log lines check karo.",
      "`systemctl restart` service band karke nayi shuru karta hai; `reload` bina connection tode config update karta hai.",
      "`systemctl enable` = server reboot par automatic boot-up activate karo.",
      "`journalctl -u <service> -f` = service ke centralized logs live dekho."
    ],
    "check": {
      "q": "Tumne ek nayi service install karke `systemctl start myservice` chalaya. Service shuru ho gayi. Par agle hafte server reboot hone par service start nahi hui. Kya bhool gaye the?",
      "a": [
        "systemctl restart chalana bhool gaye the.",
        "systemctl enable myservice chalana bhool gaye the taaki startup symlink ban sake.",
        "chmod 777 dena bhool gaye the.",
        "root password change karna bhool gaye the."
      ],
      "c": 1,
      "why": "`systemctl start` sirf current session ke liye chalu karta hai. Boot time auto-start karne ke liye `systemctl enable` chalana mandatory hota hai."
    },
    "syntax": {
      "code": "systemctl status <srv>       # View service status and health\nsystemctl start <srv>        # Start service\nsystemctl stop <srv>         # Stop service\nsystemctl restart <srv>      # Restart service\nsystemctl reload <srv>       # Reload config without killing connections\nsystemctl enable <srv>       # Auto-start on system boot\njournalctl -u <srv> -f       # Live log tail",
      "parts": [
        [
          "status",
          "Shows loaded path, active state, memory, uptime, PID, recent logs."
        ],
        [
          "enable",
          "Creates symlink under /etc/systemd/system/*.wants/."
        ],
        [
          "reload",
          "Zero-downtime configuration reload."
        ],
        [
          "journalctl -u",
          "Filters system journal by systemd unit name."
        ]
      ]
    },
    "scenario": "Cloud VM patch update ke baad auto-reboot ho gaya. Customer complaint aayi ki web store down hai. Pata chala ki backend service `payapi` `systemctl enable` nahi thi, isliye reboot par band reh gayi. Team ne `systemctl enable --now payapi` chalakar post-mortem incident close kiya.",
    "tasks": [
      {
        "t": "`nginx` service ka active status check karo (`systemctl status`).",
        "sql": "systemctl status nginx"
      },
      {
        "t": "Failed `payapi` service ke recent error logs check karo (`journalctl -u payapi -n 5`).",
        "sql": "journalctl -u payapi -n 5"
      },
      {
        "t": "`payapi` service ko start karo (`sudo systemctl start`).",
        "sql": "sudo systemctl start payapi\nsystemctl status payapi"
      }
    ],
    "mistakes": [
      {
        "bad": "kill -9 nginx_pid (to restart nginx)",
        "err": "dropped connections, unclean socket state",
        "why": "Production services ko kill karne ke bajaye hamesha `systemctl reload nginx` ya `systemctl restart nginx` se band/chalu karna chahiye.",
        "fix": "sudo systemctl reload nginx"
      },
      {
        "bad": "edited /etc/systemd/system/app.service and did not reload daemon",
        "err": "Warning: unit file changed on disk, run systemctl daemon-reload",
        "why": "Jab bhi service unit file modify karo, systemd ko batane ke liye `sudo systemctl daemon-reload` chalana compulsory hota hai.",
        "fix": "sudo systemctl daemon-reload"
      }
    ],
    "intro": "बिल्डिंग का सेंट्रल पावर कंट्रोल रूम सोचो। हर सर्विस, जैसे इंजन-एक्स वेब सर्वर, पे-ए-पी-आई बैकएंड, ओरेकल डी-बी और एस-एस-एच, का एक मास्टर स्विच है, यानी सिस्टम-सी-टी-एल। इनेबल बोलता है जब भी सर्वर रीबूट शुरू हो, ये स्विच ऑटोमैटिकली ऑन कर देना। और जर्नल-सी-टी-एल बराबर ब्लैक बॉक्स फ़्लाइट रिकॉर्डर जो हर सर्विस का लॉग रखता है।"
  },
  {
    "id": "lx-disk-full",
    "course": "linux",
    "sec": "Storage, Disks, Mounts aur Backups",
    "title": "Production Incident: \"No space left on device\" (df, du)",
    "url": "https://man7.org/linux/man-pages/man1/df.1.html",
    "meta": "Linux · prod-db01 · bash",
    "summary": "Sabse common production P1 incident: Disk 100% full hone par database freeze! `df -h` se kaunsa partition bhara hai pehchanna, `du -sh /var/log/* | sort -h` se sabse badi directory pakadna, aur deleted files held open by process (`lsof | grep deleted`) release karna.",
    "simple": "Ghar ka kachre ka dabba bhar kar overflow ho gaya. Pehla step: Pata karo kaunsa kamra bhara hai (`df -h`). Doosra step: Kamre ke andar kaun sa box sabse bada hai (`du -sh *`). Teesra step: Agar kachra fenk diya fir bhi dabba bhara dikhe, toh dekho kisne kachre ke dabbe par pair rakh kar roke rakha hai (`lsof | grep deleted`)!",
    "words": [
      [
        "df -h",
        "Disk Free: Sabhi mounted partitions ki total, used, aur available space dikhata hai."
      ],
      [
        "du -sh",
        "Disk Usage: Kisi file ya directory ka exact size calculate karta hai."
      ],
      [
        "sort -h",
        "Human-readable sorting (100K < 20M < 5G)."
      ],
      [
        "lsof",
        "List Open Files: Kaunsa process kaunsi file open karke betha hai."
      ],
      [
        "Held Open File",
        "File `rm` se delete ho chuki hai par running process ne handle band nahi kiya, isliye disk space free nahi hoti!"
      ],
      [
        "> app.log",
        "Truncate: File delete karne ke bajaye uska size zero `0` bytes karna (safest for running logs)."
      ]
    ],
    "nodes": [
      [
        "mroot",
        "meter",
        24,
        38,
        360,
        20,
        "/ (/dev/sda2 · 50G)",
        {
          "sub": "30% Used (Healthy)",
          "level": 0.3,
          "tone": "ok"
        }
      ],
      [
        "mvar",
        "meter",
        24,
        92,
        360,
        20,
        "/var/log (/dev/sda3 · 20G)",
        {
          "sub": "89% FULL (17G Used!)",
          "level": 0.89,
          "tone": "danger"
        }
      ],
      [
        "mu01",
        "meter",
        24,
        146,
        360,
        20,
        "/u01 (/dev/sdb1 · 200G)",
        {
          "sub": "49% Used (98G Avail)",
          "level": 0.49,
          "tone": "accent"
        }
      ],
      [
        "dutbl",
        "table",
        416,
        38,
        520,
        148,
        "du -sh /var/log/* | sort -h",
        {
          "cols": [
            "SIZE",
            "FILE / FOLDER",
            "STATE"
          ],
          "cw": [
            0.18,
            0.46,
            0.36
          ]
        }
      ],
      [
        "term",
        "term",
        24,
        202,
        912,
        308,
        "Terminal · Disk Space Incident Triage"
      ]
    ],
    "code": [
      "# 1. First response: Check which partition is 100% full",
      "df -h",
      "# 2. Find which folder or file is eating up space in /var/log",
      "du -sh /var/log/*",
      "# 3. Sort subdirectories by size (largest at bottom)",
      "du -sh /var/log/* | sort -h",
      "# 4. Check for deleted files still held open by running processes",
      "lsof | grep -i deleted",
      "# 5. Safely truncate log file without restarting application",
      "> /tmp/junk.log",
      "ls -lh /tmp/junk.log"
    ],
    "codeTitle": "Bash · prod-db01",
    "steps": [
      {
        "say": "PagerDuty alert: \"Critical - Disk full on prod-db01\". Database ne writes reject karna shuru kar diya. Engineer turant terminal par `df -h` chalata hai.",
        "ops": [
          [
            "show",
            "mroot",
            "mvar",
            "mu01",
            "term"
          ]
        ],
        "vo": "पेजर-ड्यूटी अलर्ट: क्रिटिकल, डिस्क फ़ुल ऑन प्रोड-डी-बी ज़ीरो वन। डेटाबेस ने राइट्स रिजेक्ट करना शुरू कर दिया। इंजीनियर तुरंत टर्मिनल पर डी-एफ़ डैश एच चलाता है।"
      },
      {
        "say": "Partition check karo: `/var/log` 89% full hai aur 2.1G hi bacha hai. Agar yeh 100% ho gaya toh system freeze ho jayega.",
        "code": [
          0,
          1
        ],
        "ops": [
          [
            "pulse",
            "mvar"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ df -h"
          ],
          [
            "out",
            "term",
            "Filesystem      Size  Used Avail Use% Mounted on",
            "/dev/sda2        50G   14G   34G  30% /",
            "/dev/sda3        20G   17G  2.1G  89% /var/log",
            "/dev/sdb1       200G   92G   98G  49% /u01"
          ]
        ],
        "vo": "पार्टीशन चेक करो: स्लैश वार स्लैश लॉग एटी-नाइन परसेंट फ़ुल है और टू पॉइंट वन जी ही बचा है। अगर ये हंड्रेड परसेंट हो गया तो सिस्टम फ़्रीज़ हो जाएगा।"
      },
      {
        "say": "Ab `/var/log` ke andar jao aur `du -sh /var/log/* | sort -h` chalao taaki sabse badi files aakhir mein sort hokar samne aayein.",
        "code": [
          2,
          3,
          4
        ],
        "ops": [
          [
            "show",
            "dutbl"
          ],
          [
            "rows",
            "dutbl",
            [
              [
                "4.0K",
                "/var/log/auth.log",
                "Normal"
              ],
              [
                "16K",
                "/var/log/nginx",
                "Normal"
              ],
              [
                "128K",
                "/var/log/syslog",
                "Normal"
              ],
              [
                "15G",
                "/var/log/syslog.1.old",
                "CULPRIT (75% disk!)"
              ]
            ]
          ],
          [
            "mark",
            "dutbl",
            [
              3
            ],
            "danger"
          ],
          [
            "colhl",
            "dutbl",
            [
              0
            ],
            "danger"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ du -sh /var/log/* | sort -h"
          ],
          [
            "out",
            "term",
            "4.0K    /var/log/auth.log",
            "16K     /var/log/nginx",
            "28K     /var/log/oracle",
            "128K    /var/log/syslog",
            "15G     /var/log/syslog.1.old"
          ]
        ],
        "vo": "अब स्लैश वार स्लैश लॉग के अंदर जाओ और डी-यू डैश एस-एच स्लैश वार स्लैश लॉग स्लैश स्टार पाइप सॉर्ट डैश एच चलाओ ताकि सबसे बड़ी फ़ाइल्स आख़िर में सॉर्ट होकर सामने आएँ।"
      },
      {
        "say": "Classic Trap: Agar tumne `rm big.log` chala diya par koi process usme likh raha tha, toh file gayab ho jayegi par disk free nahi hogi! Isko `lsof | grep deleted` se pakda jata hai.",
        "code": [
          5,
          6
        ],
        "ops": [
          [
            "cell",
            "dutbl",
            3,
            2,
            "Held open by PID 1420 (deleted)"
          ],
          [
            "pulse",
            "dutbl"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ lsof | grep -i deleted"
          ],
          [
            "out",
            "term",
            "payapi    1420 appuser    3w   REG  8,3 16106127360 /var/log/syslog.1.old (deleted)"
          ]
        ],
        "vo": "क्लासिक ट्रैप: अगर तुमने आर-एम बिग डॉट लॉग चला दिया पर कोई प्रोसेस उसमें लिख रहा था, तो फ़ाइल ग़ायब हो जाएगी पर डिस्क फ़्री नहीं होगी! इसको एल-एस-ओ-एफ़ पाइप ग्रेप डिलीटेड से पकड़ा जाता है।"
      },
      {
        "say": "Job Secret: Running application ke log ko truncate karne ka sabse safe tareeqa: `> /path/logfile.log`. File handle open rehta hai, app crash nahi hoti aur space instant free!",
        "code": [
          7,
          8,
          9,
          10
        ],
        "ops": [
          [
            "term",
            "term",
            "oracle@prod-db01:~$ echo \"huge 100MB temp data\" > /tmp/junk.log"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ > /tmp/junk.log"
          ],
          [
            "cell",
            "dutbl",
            3,
            0,
            "0B"
          ],
          [
            "cell",
            "dutbl",
            3,
            2,
            "Truncated (> file) · Freed!"
          ],
          [
            "mark",
            "dutbl",
            [
              3
            ],
            "ok"
          ],
          [
            "colhl",
            "dutbl",
            []
          ],
          [
            "level",
            "mvar",
            0.14
          ],
          [
            "tone",
            "mvar",
            "ok"
          ],
          [
            "label",
            "mvar",
            "/var/log (/dev/sda3 · 20G)",
            "14% Used (17.2G Free!)"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ ls -lh /tmp/junk.log"
          ],
          [
            "out",
            "term",
            "-rw-r--r-- 1 oracle oinstall 0 Oct 29 10:45 /tmp/junk.log"
          ]
        ],
        "vo": "जॉब सीक्रेट: रनिंग एप्लिकेशन के लॉग को ट्रंकेट करने का सबसे सेफ़ तरीक़ा: ग्रेटर-दैन स्लैश पाथ स्लैश लॉगफ़ाइल डॉट लॉग। फ़ाइल हैंडल ओपन रहता है, ऐप क्रैश नहीं होती और स्पेस इंस्टेंट फ़्री!"
      }
    ],
    "points": [
      "`df -h` = partition level space (kaunsa drive full hai).",
      "`du -sh * | sort -h` = directory level space (kaunsa folder sabse bada hai).",
      "Agar file delete hone ke baad bhi disk full rahe, `lsof | grep deleted` check karo.",
      "`> filename` = running log file ko zero bytes par truncate karne ka safe tarika."
    ],
    "check": {
      "q": "Tumne ek 20GB ki log file `rm -f app.log` se delete kar di. Par `df -h` mein abhi bhi 100% full dikha raha hai aur disk space free nahi hui. Asli wajah kya hai?",
      "a": [
        "Linux ko reboot hone mein 24 ghante lagte hain.",
        "Ek running process ne abhi bhi us file ka file descriptor open rakha hua hai.",
        "rm command kharab ho gayi hai.",
        "Disk partition corrupt ho gaya hai."
      ],
      "c": 1,
      "why": "Linux tab tak disk blocks free nahi karta jab tak file ko open rakhne wale saare processes exit na ho jayein ya file descriptor close na kar dein. Process restart karte hi space free ho jaati hai."
    },
    "syntax": {
      "code": "df -h                            # Check all partitions\ndu -sh /var/log/* | sort -h      # Sort files/dirs by size\ndu -ah /var/log | sort -h | tail -n 10 # Top 10 largest items\nlsof | grep -i deleted           # Check unlinked held files\n> /path/to/active.log            # Truncate running file to 0 bytes",
      "parts": [
        [
          "df -h",
          "Disk filesystem human-readable."
        ],
        [
          "du -sh",
          "Summary (-s) human-readable (-h) disk usage."
        ],
        [
          "sort -h",
          "Sorts numeric values with suffixes K, M, G correctly."
        ],
        [
          "lsof",
          "Lists processes holding open unlinked inodes."
        ]
      ]
    },
    "scenario": "Production Oracle Database par `ORA-00257: archiver error. Connect internal only, until freed` aaya. Archivelog partition 100% full tha. DBA ne `df -h` se dekha, RMAN se purane backed up archivelogs delete kiye aur database instant accept queries karne laga.",
    "tasks": [
      {
        "t": "System ke sabhi filesystem partitions ka space check karo (`df -h`).",
        "sql": "df -h"
      },
      {
        "t": "`/var/log` ke saare files aur folders ka size calculate karo (`du -sh /var/log/*`).",
        "sql": "du -sh /var/log/*"
      },
      {
        "t": "`/tmp/junk.log` file banao aur use `>` se 0 bytes par truncate karo.",
        "sql": "echo \"temp data\" > /tmp/junk.log\n> /tmp/junk.log\nls -lh /tmp/junk.log"
      }
    ],
    "mistakes": [
      {
        "bad": "rm -f active_database.log (while app running)",
        "err": "space not freed, app crashed on next write",
        "why": "Running process ki active log file `rm` karne ke bajaye hamesha `> active_database.log` se truncate karo.",
        "fix": "> active_database.log"
      },
      {
        "bad": "du -s / (without h)",
        "err": "unreadable raw 1K block numbers",
        "why": "Bina `-h` ke millions of blocks dikhte hain jinhe samajhna mushkil hota hai. Hamesha `du -sh` lagao.",
        "fix": "du -sh /var/log/*"
      }
    ],
    "intro": "घर का कचरे का डब्बा भर कर ओवरफ़्लो हो गया। पहला स्टेप: पता करो कौनसा कमरा भरा है, यानी डी-एफ़ डैश एच। दूसरा स्टेप: कमरे के अंदर कौनसा बॉक्स सबसे बड़ा है, यानी डी-यू डैश एस-एच स्टार। तीसरा स्टेप: अगर कचरा फेंक दिया फिर भी डब्बा भरा दिखे, तो देखो किसने कचरे के डब्बे पर पैर रख कर रोके रखा है, यानी एल-एस-ओ-एफ़ पाइप ग्रेप डिलीटेड!"
  },
  {
    "id": "lx-mounts",
    "course": "linux",
    "sec": "Storage, Disks, Mounts aur Backups",
    "title": "Mount points, /etc/fstab aur lsblk: Storage jodna",
    "url": "https://man7.org/linux/man-pages/man8/mount.8.html",
    "meta": "Linux · prod-db01 · bash",
    "summary": "Hard drive aur network storage ko Linux folder tree se jodna: `lsblk` se block devices dekhna, filesystem banana (`mkfs.xfs`), temporary mount `mount /dev/sdb1 /u02`, persistent reboot mounts `/etc/fstab`, UUID usage, aur `mount -a` testing.",
    "simple": "USB pen drive socho. Windows mein plug karte hi `E:` drive ban jata hai. Linux mein koi `C:` ya `D:` drive nahi hota; har hard disk ko kisi khaali folder (mount point, jaise `/u01` ya `/mnt/backup`) par baandhna (mount karna) padta hai. Aur `/etc/fstab` = computer ki dairy jisme likha hota hai ki reboot par kaunsi drive kahan jodti hai.",
    "words": [
      [
        "lsblk",
        "List Block Devices: System se judi sabhi hard drives aur unke partitions ka tree."
      ],
      [
        "Mount Point",
        "Linux root tree ka ek normal folder jahan kisi external drive ko attach kiya jata hai."
      ],
      [
        "mount",
        "Storage disk ko kisi folder se jodna (`mount /dev/sdb1 /u01`)."
      ],
      [
        "umount",
        "Disk ko safely unmount/detach karna."
      ],
      [
        "/etc/fstab",
        "File System Table: Boot ke waqt automatically mount hone wali drives ki master config."
      ],
      [
        "UUID",
        "Universally Unique Identifier: Hard drive ka permanent biometric ID jo reboot par badalta nahi."
      ],
      [
        "mount -a",
        "Mount All: /etc/fstab mein likhi saari entries ko bina reboot kiye test mount karna."
      ]
    ],
    "nodes": [
      [
        "sda",
        "disk",
        24,
        34,
        130,
        68,
        "/dev/sda (50G)",
        {
          "sub": "sda1, sda2, sda3",
          "inside": "OS Disk",
          "tone": "file",
          "level": 0.35
        }
      ],
      [
        "sdb",
        "disk",
        180,
        34,
        130,
        68,
        "/dev/sdb1 (200G)",
        {
          "sub": "ext4 partition",
          "inside": "Oracle Disk",
          "tone": "accent",
          "level": 0.49
        }
      ],
      [
        "mnt",
        "proc",
        350,
        48,
        155,
        48,
        "mount /dev/sdb1",
        {
          "sub": "-> /u01 (rw)",
          "tone": "proc"
        }
      ],
      [
        "ftbl",
        "table",
        535,
        36,
        401,
        144,
        "/etc/fstab (Persistent Boot Mounts)",
        {
          "cols": [
            "UUID",
            "MOUNT",
            "FS",
            "OPTS"
          ],
          "cw": [
            0.32,
            0.24,
            0.16,
            0.28
          ]
        }
      ],
      [
        "term",
        "term",
        24,
        202,
        912,
        308,
        "Terminal · Storage Mounting"
      ]
    ],
    "code": [
      "# 1. Inspect block devices and existing partitions",
      "lsblk",
      "# 2. Check current mounted filesystems",
      "mount | grep \"/u01\"",
      "# 3. View persistent mount table configuration",
      "cat /etc/fstab",
      "# 4. Golden Sysadmin Rule: Always test /etc/fstab syntax without rebooting",
      "sudo mount -a"
    ],
    "codeTitle": "Bash · prod-db01",
    "steps": [
      {
        "say": "Nayi hard disk AWS EBS ya SAN storage se attach hui. Linux mein use directly access nahi kiya ja sakta; use pehle kisi folder par mount karna padta hai.",
        "ops": [
          [
            "show",
            "sda",
            "sdb",
            "term"
          ],
          [
            "pulse",
            "sdb"
          ]
        ],
        "vo": "नई हार्ड डिस्क ए-डब्ल्यू-एस ई-बी-एस या सैन स्टोरेज से अटैच हुई। लिनक्स में उसे डायरेक्टली एक्सेस नहीं किया जा सकता; उसे पहले किसी फ़ोल्डर पर माउंट करना पड़ता है।"
      },
      {
        "say": "Block devices ki list dekhne ke liye `lsblk` chalao. Yahan `sda` (50G root OS) aur `sdb` (200G oracle data disk) dikhai degi.",
        "code": [
          0,
          1
        ],
        "ops": [
          [
            "term",
            "term",
            "oracle@prod-db01:~$ lsblk"
          ],
          [
            "out",
            "term",
            "NAME   MAJ:MIN RM  SIZE RO TYPE MOUNTPOINTS",
            "sda      8:0    0   50G  0 disk",
            "├─sda1   8:1    0  512M  0 part /boot/efi",
            "├─sda2   8:2    0 29.5G  0 part /",
            "└─sda3   8:3    0   20G  0 part /var/log",
            "sdb      8:16   0  200G  0 disk",
            "└─sdb1   8:17   0  200G  0 part /u01"
          ],
          [
            "ok",
            "sda"
          ],
          [
            "ok",
            "sdb"
          ]
        ],
        "vo": "ब्लॉक डिवाइसेज़ की लिस्ट देखने के लिए एल-एस-बी-एल-के चलाओ। यहाँ एस-डी-ए फिफ्टी जी रूट ओ-एस और एस-डी-बी टू हंड्रेड जी ओरेकल डेटा डिस्क दिखाई देगी।"
      },
      {
        "say": "Check karo `/u01` par kaunsa filesystem laga hai: `mount | grep \"/u01\"` se pata chalta hai yeh `ext4` ya `xfs` filesystem hai jo `rw` (read-write) mounted hai.",
        "code": [
          2,
          3
        ],
        "ops": [
          [
            "show",
            "mnt"
          ],
          [
            "link",
            "sdb",
            "mnt",
            {
              "tone": "accent"
            }
          ],
          [
            "flow",
            "sdb",
            "mnt",
            "ext4 (rw)",
            {
              "tone": "ok",
              "dur": 550
            }
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ mount | grep \"/u01\""
          ],
          [
            "out",
            "term",
            "/dev/sdb1 on /u01 type ext4 (rw,relatime)"
          ],
          [
            "ok",
            "mnt"
          ]
        ],
        "vo": "चेक करो स्लैश यू-ज़ीरो-वन पर कौनसा फ़ाइलसिस्टम लगा है: माउंट पाइप ग्रेप स्लैश यू-ज़ीरो-वन से पता चलता है ये ई-एक्स-टी फोर या एक्स-एफ़-एस फ़ाइलसिस्टम है जो रीड-राइट माउंटेड है।"
      },
      {
        "say": "Drives ko reboot ke baad zinda rakhne ke liye `/etc/fstab` mein entry ki jaati hai: `UUID=<id> /u01 ext4 defaults 0 2`.",
        "code": [
          4,
          5
        ],
        "ops": [
          [
            "show",
            "ftbl"
          ],
          [
            "link",
            "mnt",
            "ftbl",
            {
              "tone": "proc"
            }
          ],
          [
            "rows",
            "ftbl",
            [
              [
                "e2a1b4c3...",
                "/",
                "ext4",
                "defaults,noatime"
              ],
              [
                "f3b2c5d4...",
                "/var/log",
                "ext4",
                "defaults"
              ],
              [
                "a1b2c3d4...",
                "/u01",
                "ext4",
                "defaults"
              ]
            ]
          ],
          [
            "mark",
            "ftbl",
            [
              2
            ],
            "accent"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ cat /etc/fstab"
          ],
          [
            "out",
            "term",
            "# /etc/fstab: static file system information.",
            "UUID=e2a1b4c3-1111-4a2b-8a12-987654321000 /          ext4    defaults,noatime 0 1",
            "UUID=f3b2c5d4-2222-4b3c-9b23-123456789abc /var/log   ext4    defaults         0 2",
            "UUID=a1b2c3d4-3333-4c4d-0c34-abcdef012345 /u01       ext4    defaults         0 2"
          ]
        ],
        "vo": "ड्राइव्स को रीबूट के बाद ज़िंदा रखने के लिए स्लैश ई-टी-सी स्लैश एफ़-एस-टैब में एंट्री की जाती है: यू-यू-आई-डी स्लैश यू-ज़ीरो-वन ई-एक्स-टी फोर डिफ़ॉल्ट्स ज़ीरो टू।"
      },
      {
        "say": "Warning: `/etc/fstab` mein ek comma ya typo hua toh server agle reboot par emergency mode mein freeze ho jayega! Hamesha edit ke baad `sudo mount -a` chala kar verify karo.",
        "code": [
          6,
          7
        ],
        "ops": [
          [
            "term",
            "term",
            "oracle@prod-db01:~$ sudo mount -a"
          ],
          [
            "mark",
            "ftbl",
            [
              0,
              1,
              2
            ],
            "ok"
          ],
          [
            "ok",
            "ftbl"
          ]
        ],
        "vo": "वॉर्निंग: स्लैश ई-टी-सी स्लैश एफ़-एस-टैब में एक कॉमा या टाइपो हुआ तो सर्वर अगले रीबूट पर इमरजेंसी मोड में फ़्रीज़ हो जाएगा! हमेशा एडिट के बाद सूडो माउंट डैश ए चला कर वेरिफ़ाई करो।"
      }
    ],
    "points": [
      "`lsblk` se system ki physical/virtual hard disks aur partitions ka tree dikhta hai.",
      "`mount /dev/sdb1 /dir` disk ko folder par jodta hai; `umount /dir` unmount karta hai.",
      "Reboot par persistence ke liye `/etc/fstab` mein UUID ke saath entry ki jaati hai.",
      "Fstab edit karne ke baad bina `sudo mount -a` verify kiye server reboot kabhi mat karna."
    ],
    "check": {
      "q": "DevOps engineer ne `/etc/fstab` mein nayi disk add ki aur bina check kiye server reboot kar diya. Server start nahi hua aur \"emergency mode\" screen aa gayi. Kaunsi command fstab syntax verify karne ke liye bachati?",
      "a": [
        "lsblk",
        "df -h",
        "sudo mount -a",
        "umount"
      ],
      "c": 2,
      "why": "`mount -a` `/etc/fstab` ki saari entries ko foran mount karne ki koshish karta hai. Agar syntax error ya missing disk ho, toh yeh screen par error dikha deta hai bina reboot kiye."
    },
    "syntax": {
      "code": "lsblk                                  # View disks and mounts\nmount /dev/sdb1 /mnt/data              # Mount partition to directory\numount /mnt/data                       # Unmount directory\nblkid /dev/sdb1                        # Get UUID of partition\nsudo mount -a                          # Test all fstab entries",
      "parts": [
        [
          "lsblk",
          "Lists storage tree."
        ],
        [
          "UUID",
          "Permanent filesystem signature."
        ],
        [
          "/etc/fstab",
          "Columns: <device/UUID> <mountpoint> <type> <options> <dump> <fsck_pass>."
        ],
        [
          "mount -a",
          "Mounts everything mentioned in fstab that is not already mounted."
        ]
      ]
    },
    "scenario": "Production Oracle RAC node par naya LUN add hua. Engineer ne `/dev/sdc1` ko `/u02` par mount kiya aur fstab mein UUID ke bajaye `/dev/sdc1` likh diya. Reboot par kernel ne devices rename karke use `/dev/sdd1` bana diya aur mount toot gaya. Senior architect ne UUID se update karke permanent fix lagaya.",
    "tasks": [
      {
        "t": "System se jude sabhi storage devices aur unke mount points inspect karo (`lsblk`).",
        "sql": "lsblk"
      },
      {
        "t": "`/u01` mount point ka filesystem aur mount options check karo (`mount | grep`).",
        "sql": "mount | grep \"/u01\""
      },
      {
        "t": "`/etc/fstab` table inspect karo aur `sudo mount -a` se check karo.",
        "sql": "cat /etc/fstab\nsudo mount -a"
      }
    ],
    "mistakes": [
      {
        "bad": "/etc/fstab mein device name (/dev/sdb1) likhna",
        "err": "failed mount after reboot",
        "why": "Cloud aur SAN environment mein reboot ke baad `/dev/sdb1` badal kar `/dev/sdc1` ban sakta hai. Fstab mein hamesha `UUID=` use karo.",
        "fix": "blkid /dev/sdb1 -> UUID=xxxx"
      },
      {
        "bad": "umount /u01 (jab user usi folder ke andar baitha ho)",
        "err": "target is busy",
        "why": "Agar koi process ya terminal session `/u01` ke andar open ho, toh disk unmount nahi hoti. Pehle bahar niklo (`cd /`) fir unmount karo.",
        "fix": "cd / && umount /u01"
      }
    ],
    "intro": "यू-एस-बी पेन ड्राइव सोचो। विंडोज़ में प्लग करते ही ई ड्राइव बन जाता है। लिनक्स में कोई सी या डी ड्राइव नहीं होता; हर हार्ड डिस्क को किसी खाली फ़ोल्डर, जैसे स्लैश यू-ज़ीरो-वन या स्लैश एम-एन-टी स्लैश बैकअप, पर माउंट करना पड़ता है। और स्लैश ई-टी-सी स्लैश एफ़-एस-टैब बराबर कंप्यूटर की डायरी जिसमें लिखा होता है कि रीबूट पर कौनसी ड्राइव कहाँ जोड़नी है।"
  },
  {
    "id": "lx-tar-rsync",
    "course": "linux",
    "sec": "Storage, Disks, Mounts aur Backups",
    "title": "tar, gzip aur rsync: Production backups aur data transfer",
    "url": "https://man7.org/linux/man-pages/man1/tar.1.html",
    "meta": "Linux · prod-db01 · bash",
    "summary": "Sysadmin backup toolbox: `tar -czvf backup.tar.gz /folder` (Tape Archive + gzip compression), extract `tar -xzvf backup.tar.gz -C /dest`, aur delta sync ka badshah `rsync -avz --progress` (sirf badle hue bytes transfer karna).",
    "simple": "Courier packing socho. 50 alag-alag papers courier karne ke bajaye tum unhe ek binde folder mein dalke tape laga dete ho (`tar`), fir use vacuum pack se squeeze karke chhota kar dete ho (`gzip`). Aur `rsync` = smart courier jo doosre shehar wahi file bhejta hai jo pichhli baar se badli ho, poora dubara nahi bhejta.",
    "words": [
      [
        "tar",
        "Tape Archive: Kai files aur directories ko ek single `.tar` archive file mein pack karna."
      ],
      [
        "-c",
        "Create: Naya archive banana."
      ],
      [
        "-x",
        "Extract: Archive se files bahar nikaalna."
      ],
      [
        "-z",
        "Gzip: Archive ko gzip compression se chhota karna (`.tar.gz`)."
      ],
      [
        "-v",
        "Verbose: Pack/unpack hoti files ki list screen par dikhana."
      ],
      [
        "-f",
        "File: Archive ka filename specify karna."
      ],
      [
        "rsync",
        "Remote Sync: Local ya remote server ke beech smart delta sync tool jo sirf modified bytes bhejta hai."
      ],
      [
        "rsync -avz",
        "Archive mode (-a), Verbose (-v), Compressed transfer (-z)."
      ]
    ],
    "nodes": [
      [
        "src",
        "region",
        24,
        28,
        220,
        152,
        "app/ (Source Folder)",
        {
          "tone": "file",
          "sub": "740B total"
        }
      ],
      [
        "f1",
        "doc",
        40,
        66,
        86,
        44,
        "app.env",
        {
          "tone": "file"
        }
      ],
      [
        "f2",
        "doc",
        142,
        66,
        86,
        44,
        "server.js",
        {
          "tone": "file"
        }
      ],
      [
        "f3",
        "doc",
        88,
        122,
        96,
        44,
        "package.json",
        {
          "tone": "file"
        }
      ],
      [
        "tar",
        "proc",
        274,
        76,
        155,
        54,
        "tar -czvf",
        {
          "sub": "Bundle + Gzip",
          "tone": "accent"
        }
      ],
      [
        "targz",
        "disk",
        464,
        54,
        160,
        74,
        "app_backup.tar.gz",
        {
          "sub": "Compressed archive",
          "inside": ".tar.gz",
          "tone": "ok",
          "level": 0.6
        }
      ],
      [
        "tmp",
        "box",
        664,
        34,
        272,
        64,
        "/tmp/app/ (Extracted)",
        {
          "sub": "tar -xzvf -C /tmp/",
          "tone": "accent"
        }
      ],
      [
        "rsync",
        "proc",
        664,
        114,
        272,
        64,
        "rsync -av -> /tmp/app_sync/",
        {
          "sub": "Delta Transfer (Only changed bytes!)",
          "tone": "proc"
        }
      ],
      [
        "term",
        "term",
        24,
        204,
        912,
        306,
        "Terminal · Backup & Transfer"
      ]
    ],
    "code": [
      "# 1. Create a compressed tarball archive of app directory (-czvf)",
      "tar -czvf app_backup.tar.gz app/",
      "# 2. View contents of tar archive without extracting (-tzvf)",
      "tar -tzvf app_backup.tar.gz",
      "# 3. Extract tarball to /tmp directory (-xzvf ... -C)",
      "tar -xzvf app_backup.tar.gz -C /tmp/",
      "ls -la /tmp/app/",
      "# 4. Synchronize folder using rsync (smart delta copy)",
      "rsync -av app/ /tmp/app_sync/",
      "ls -la /tmp/app_sync/"
    ],
    "codeTitle": "Bash · prod-db01",
    "steps": [
      {
        "say": "Production release se pehle application code aur configuration ka quick snapshot lena standard protocol hai. `tar` aur `rsync` is kaam ke enterprise tools hain.",
        "ops": [
          [
            "show",
            "src",
            "f1",
            "f2",
            "f3",
            "tar",
            "term"
          ],
          [
            "link",
            "src",
            "tar",
            {
              "tone": "accent"
            }
          ]
        ],
        "vo": "प्रोडक्शन रिलीज़ से पहले एप्लिकेशन कोड और कॉन्फ़िगरेशन का क्विक स्नैपशॉट लेना स्टैंडर्ड प्रोटोकॉल है। टार और आर-सिंक इस काम के एंटरप्राइज टूल्स हैं।"
      },
      {
        "say": "Formula yaad rakho: `tar -czvf <archive.tar.gz> <source_folder>`. `c`=create, `z`=gzip, `v`=verbose, `f`=file.",
        "code": [
          0,
          1
        ],
        "ops": [
          [
            "show",
            "targz"
          ],
          [
            "link",
            "tar",
            "targz",
            {
              "tone": "ok"
            }
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ tar -czvf app_backup.tar.gz app/"
          ],
          [
            "flow",
            "src",
            "tar",
            "3 files",
            {
              "tone": "accent",
              "dur": 500
            }
          ],
          [
            "flow",
            "tar",
            "targz",
            "compress",
            {
              "tone": "ok",
              "dur": 550
            }
          ],
          [
            "out",
            "term",
            "app/",
            "app/app.env",
            "app/package.json",
            "app/server.js"
          ],
          [
            "ok",
            "targz"
          ]
        ],
        "vo": "फ़ॉर्मूला याद रखो: टार डैश सी-ज़ी-वी-एफ़ आर्काइव डॉट टार डॉट जी-ज़ी सोर्स फ़ोल्डर। सी बराबर क्रिएट, ज़ी बराबर जी-ज़िप, वी बराबर वर्बोस, एफ़ बराबर फ़ाइल।"
      },
      {
        "say": "Archive kholne se pehle dekhna ho ki andar kya hai, toh `t` (test/table) flag use karo: `tar -tzvf app_backup.tar.gz`.",
        "code": [
          2,
          3
        ],
        "ops": [
          [
            "pulse",
            "targz"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ tar -tzvf app_backup.tar.gz"
          ],
          [
            "out",
            "term",
            "drwxr-xr-x oracle/oinstall  0 2026-10-29 10:15 app/",
            "-rw------- oracle/oinstall 80 2026-10-29 10:15 app/app.env",
            "-rw-r--r-- oracle/oinstall 210 2026-10-29 10:00 app/package.json",
            "-rw-r--r-- oracle/oinstall 450 2026-10-29 10:00 app/server.js"
          ]
        ],
        "vo": "आर्काइव खोलने से पहले देखना हो कि अंदर क्या है, तो टी फ़्लैग यूज़ करो: टार डैश टी-ज़ी-वी-एफ़ ऐप बैकअप डॉट टार डॉट जी-ज़ी।"
      },
      {
        "say": "Archive extract karne ke liye `-x` (extract) flag lagao. Agar kisi specific directory mein nikaalna ho toh `-C /target/path` lagao.",
        "code": [
          4,
          5,
          6
        ],
        "ops": [
          [
            "show",
            "tmp"
          ],
          [
            "link",
            "targz",
            "tmp",
            {
              "label": "-xzvf -C /tmp",
              "tone": "accent"
            }
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ tar -xzvf app_backup.tar.gz -C /tmp/"
          ],
          [
            "flow",
            "targz",
            "tmp",
            "extract",
            {
              "tone": "accent",
              "dur": 600
            }
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ ls -la /tmp/app/"
          ],
          [
            "out",
            "term",
            "total 16",
            "drwxr-xr-x 2 oracle oinstall 4096 Oct 29 10:15 .",
            "-rw------- 1 oracle oinstall   80 Oct 29 10:15 app.env",
            "-rw-r--r-- 1 oracle oinstall  210 Oct 29 10:00 package.json",
            "-rw-r--r-- 1 oracle oinstall  450 Oct 29 10:00 server.js"
          ],
          [
            "ok",
            "tmp"
          ]
        ],
        "vo": "आर्काइव एक्सट्रैक्ट करने के लिए डैश एक्स फ़्लैग लगाओ। अगर किसी स्पेसिफ़िक डायरेक्टरी में निकालना हो तो डैश कैपिटल सी स्लैश टार्गेट पाथ लगाओ।"
      },
      {
        "say": "Delta Sync King `rsync`: Agar 50GB data mein se sirf 1MB badla ho, `rsync -avz` sirf wahi 1MB bhejega! Poora 50GB dobara copy nahi karega.",
        "code": [
          7,
          8,
          9
        ],
        "ops": [
          [
            "show",
            "rsync"
          ],
          [
            "link",
            "src",
            "rsync",
            {
              "label": "delta sync",
              "tone": "proc",
              "bend": 25
            }
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ rsync -av app/ /tmp/app_sync/"
          ],
          [
            "flow",
            "src",
            "rsync",
            "840B delta",
            {
              "tone": "proc",
              "bend": 25,
              "dur": 600
            }
          ],
          [
            "out",
            "term",
            "sending incremental file list",
            "created directory /tmp/app_sync",
            "./",
            "app.env",
            "package.json",
            "server.js",
            "sent 840 bytes  received 92 bytes  1,864.00 bytes/sec",
            "total size is 740  speedup is 0.79"
          ],
          [
            "ok",
            "rsync"
          ]
        ],
        "vo": "डेल्टा सिंक किंग आर-सिंक: अगर पचास जी-बी डेटा में से सिर्फ़ एक एम-बी बदला हो, आर-सिंक डैश ए-वी-ज़ी सिर्फ़ वही एक एम-बी भेजेगा! पूरा पचास जी-बी दोबारा कॉपी नहीं करेगा।"
      }
    ],
    "points": [
      "`tar -czvf name.tar.gz folder/` = create gzip compressed archive.",
      "`tar -xzvf name.tar.gz -C /target` = extract archive to target path.",
      "`tar -tzvf name.tar.gz` = list archive contents without extracting.",
      "`rsync -avz src/ dest/` = differential sync (transfers only changed bytes).",
      "Rsync trailing slash rule: `src/` copies contents; `src` creates directory inside dest."
    ],
    "check": {
      "q": "Backup server par har roz 100GB database backup sync karna hai par network bandwidth limited hai. `cp` ya `scp` ke bajaye `rsync -avz` use karne ka sabse bada faayda kya hai?",
      "a": [
        "rsync password nahi maangta.",
        "rsync delta transfer algorithm use karta hai jo sirf modified blocks bhejta hai, jisse 90% bandwidth aur time bachta hai.",
        "rsync file ka naam change kar deta hai.",
        "rsync se database fast ho jata hai."
      ],
      "c": 1,
      "why": "`cp` ya `scp` poori file har baar dobara copy karte hain. `rsync` destination par file check karta hai aur sirf wahi blocks bhejta hai jo change hue hain (delta transfer)."
    },
    "syntax": {
      "code": "tar -czvf <name.tar.gz> <target>       # Create compressed archive\ntar -xzvf <name.tar.gz> -C <dest>      # Extract to destination\ntar -tzvf <name.tar.gz>                # Inspect contents\nrsync -avz --progress <src>/ <dest>/   # Synchronize directory\nrsync -avz <src>/ user@host:/path/     # Remote sync over SSH",
      "parts": [
        [
          "-c / -x / -t",
          "Create / Extract / List (Table)."
        ],
        [
          "-z",
          "Filter through gzip compression."
        ],
        [
          "-v",
          "Verbose logging."
        ],
        [
          "-f",
          "Archive file name operand."
        ],
        [
          "-a",
          "Archive mode for rsync (preserves permissions, ownership, timestamps)."
        ]
      ]
    },
    "scenario": "Disaster Recovery rehearsal mein secondary datacenter par files sync karni thi. Engineer ne command chalayi: `rsync -avz --delete /u01/app/oracle/ backup-srv:/u01/app/oracle/`. 20 minute ke andar 2TB data mein se sirf 4GB changes sync hokar mirror complete ho gaya.",
    "tasks": [
      {
        "t": "`app/` directory ka compressed tar archive `app_backup.tar.gz` banao (`tar -czvf`).",
        "sql": "tar -czvf app_backup.tar.gz app/\nls -lh app_backup.tar.gz"
      },
      {
        "t": "`app_backup.tar.gz` archive ko bina extract kiye uska content inspect karo (`tar -tzvf`).",
        "sql": "tar -tzvf app_backup.tar.gz"
      },
      {
        "t": "`app/` directory ko `/tmp/app_sync/` mein sync karo (`rsync -av`).",
        "sql": "rsync -av app/ /tmp/app_sync/\nls -la /tmp/app_sync/"
      }
    ],
    "mistakes": [
      {
        "bad": "tar -czf backup.tar.gz (bina f ke baad filename)",
        "err": "tar: option requires an argument -- f",
        "why": "`-f` flag ke foran baad archive file ka naam aana chahiye. Hamesha `-czvf backup.tar.gz folder/` likho.",
        "fix": "tar -czvf backup.tar.gz folder/"
      },
      {
        "bad": "rsync -av app /tmp/dest vs app/ /tmp/dest",
        "err": "created /tmp/dest/app extra nesting",
        "why": "Rsync mein source ke pichhe slash `/` lagane se folder ke contents copy hote hain; bina slash ke poora folder khud copy hota hai.",
        "fix": "rsync -av app/ /tmp/dest/"
      }
    ],
    "intro": "कूरियर पैकिंग सोचो। पचास अलग-अलग पेपर्स कूरियर करने के बजाय तुम उन्हें एक बाइंडर फ़ोल्डर में डाल के टेप लगा देते हो, यानी टार, फिर उसे वैक्यूम पैक से स्क्वीज़ करके छोटा कर देते हो, यानी जी-ज़िप। और आर-सिंक बराबर स्मार्ट कूरियर जो दूसरे शहर वही फ़ाइल भेजता है जो पिछली बार से बदली हो, पूरा दोबारा नहीं भेजता।"
  },
  {
    "id": "lx-net-dns",
    "course": "linux",
    "sec": "Networking, Ports aur Remote Access",
    "title": "ip a, ping aur DNS: Network connectivity triage",
    "url": "https://man7.org/linux/man-pages/man8/ip.8.html",
    "meta": "Linux · prod-db01 · bash",
    "summary": "Network troubleshooting ka first response: Network interfaces dekhna `ip a` (ip addr), gateway route check karna `ip route`, packet reachability `ping -c 4`, DNS resolution `/etc/resolv.conf`, aur static IP mapping `/etc/hosts`.",
    "simple": "Phone call milane jaisa socho. `ip a` = tumhara apna phone number aur SIM card. `ping` = bell baja kar check karna ki doosri side koi utha raha hai ya nahi. `/etc/hosts` = tumhari personal contact book (speed dial). Aur `/etc/resolv.conf` (DNS) = 197 telephone directory jahan naam bolne par number milta hai.",
    "words": [
      [
        "ip a / ip addr",
        "Modern replacement of `ifconfig`: Network cards aur unke IP addresses dikhana."
      ],
      [
        "ping",
        "ICMP packets bhej kar check karna ki remote host online aur reachable hai."
      ],
      [
        "/etc/resolv.conf",
        "DNS (Domain Name System) nameservers ki configuration file."
      ],
      [
        "/etc/hosts",
        "Local hostname to IP mapping file (DNS se pehle check hoti hai)."
      ],
      [
        "Gateway",
        "Router ka IP jiske zariye packets server se bahar internet par jaate hain."
      ],
      [
        "Loopback (lo)",
        "`127.0.0.1` - server ka apna internal local network."
      ],
      [
        "eth0 / ens33",
        "Server ke physical ya virtual Ethernet network card ka naam."
      ]
    ],
    "nodes": [
      [
        "srv",
        "box",
        24,
        48,
        185,
        74,
        "prod-db01 (eth0)",
        {
          "sub": "inet 192.168.1.10/24",
          "tone": "accent"
        }
      ],
      [
        "gw",
        "proc",
        250,
        56,
        175,
        58,
        "Default Gateway",
        {
          "sub": "via 192.168.1.1",
          "tone": "proc"
        }
      ],
      [
        "hosts",
        "doc",
        470,
        26,
        195,
        62,
        "/etc/hosts",
        {
          "sub": "1st: Local static map",
          "tone": "file"
        }
      ],
      [
        "dns",
        "doc",
        470,
        108,
        195,
        62,
        "/etc/resolv.conf",
        {
          "sub": "2nd: DNS 8.8.8.8 / 1.1.1.1",
          "tone": "mem"
        }
      ],
      [
        "remote",
        "box",
        715,
        48,
        220,
        74,
        "Remote Target (8.8.8.8)",
        {
          "sub": "0% loss · ~14.1 ms RTT",
          "tone": "ok"
        }
      ],
      [
        "term",
        "term",
        24,
        200,
        912,
        310,
        "Terminal · Network Diagnostics"
      ]
    ],
    "code": [
      "# 1. Inspect network interfaces and IP addresses",
      "ip a",
      "# 2. Check routing table and default gateway",
      "ip route",
      "# 3. Check DNS nameserver configuration",
      "cat /etc/resolv.conf",
      "# 4. View local static hostname resolutions",
      "cat /etc/hosts",
      "# 5. Ping remote host with 3 packets to verify reachability",
      "ping -c 3 8.8.8.8"
    ],
    "codeTitle": "Bash · prod-db01",
    "steps": [
      {
        "say": "Jab application bolti hai \"Connection timed out\", toh pehle check karo ki kya server ke paas IP address hai aur gateway reachable hai.",
        "ops": [
          [
            "show",
            "srv",
            "term"
          ],
          [
            "pulse",
            "srv"
          ]
        ],
        "vo": "जब एप्लिकेशन बोलती है कनेक्शन टाइम्ड आउट, तो पहले चेक करो कि क्या सर्वर के पास आई-पी एड्रेस है और गेटवे रीचेबल है।"
      },
      {
        "say": "Pehle `ip a` chalao (deprecated `ifconfig` ki jagah). Yahan `eth0` interface par IP `192.168.1.10/24` dikhayi dega.",
        "code": [
          0,
          1
        ],
        "ops": [
          [
            "ok",
            "srv"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ ip a"
          ],
          [
            "out",
            "term",
            "1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN",
            "    inet 127.0.0.1/8 scope host lo",
            "2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc fq_codel state UP",
            "    inet 192.168.1.10/24 brd 192.168.1.255 scope global eth0"
          ]
        ],
        "vo": "पहले आई-पी ए चलाओ, पुरानी आई-एफ़-कॉन्फ़िग की जगह। यहाँ ई-टी-एच ज़ीरो इंटरफ़ेस पर आई-पी वन नाइंटी-टू डॉट वन सिक्सटी-एट डॉट वन डॉट टेन स्लैश ट्वेंटी-फोर दिखाई देगा।"
      },
      {
        "say": "Default gateway check karne ke liye `ip route` chalao. Yahan `default via 192.168.1.1` router ka address hai.",
        "code": [
          2,
          3
        ],
        "ops": [
          [
            "show",
            "gw"
          ],
          [
            "link",
            "srv",
            "gw",
            {
              "label": "ip route",
              "tone": "accent"
            }
          ],
          [
            "flow",
            "srv",
            "gw",
            "default via .1.1",
            {
              "tone": "accent",
              "dur": 550
            }
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ ip route"
          ],
          [
            "out",
            "term",
            "default via 192.168.1.1 dev eth0 proto dhcp metric 100",
            "192.168.1.0/24 dev eth0 proto kernel scope link src 192.168.1.10"
          ],
          [
            "ok",
            "gw"
          ]
        ],
        "vo": "डिफ़ॉल्ट गेटवे चेक करने के लिए आई-पी रूट चलाओ। यहाँ डिफ़ॉल्ट वाया वन नाइंटी-टू डॉट वन सिक्सटी-एट डॉट वन डॉट वन राउटर का एड्रेस है।"
      },
      {
        "say": "Agar IP ping ho raha hai par domain name resolve nahi ho raha, toh `/etc/resolv.conf` dekho ki kaunsa DNS nameserver set hai.",
        "code": [
          4,
          5
        ],
        "ops": [
          [
            "show",
            "dns"
          ],
          [
            "link",
            "gw",
            "dns",
            {
              "tone": "mem"
            }
          ],
          [
            "flow",
            "gw",
            "dns",
            "nameserver 8.8.8.8",
            {
              "tone": "mem",
              "dur": 550
            }
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ cat /etc/resolv.conf"
          ],
          [
            "out",
            "term",
            "# DNS configuration",
            "nameserver 8.8.8.8",
            "nameserver 1.1.1.1"
          ]
        ],
        "vo": "अगर आई-पी पिंग हो रहा है पर डोमेन नेम रिज़ॉल्व नहीं हो रहा, तो स्लैश ई-टी-सी स्लैश रिज़ॉल्व डॉट कॉन्फ़ देखो कि कौनसा डी-एन-एस नेमसर्वर सेट है।"
      },
      {
        "say": "Local DB cluster ya staging servers ke liye `/etc/hosts` mein direct mapping hoti hai. Linux hamesha DNS se pehle `/etc/hosts` padhta hai!",
        "code": [
          6,
          7,
          8,
          9
        ],
        "ops": [
          [
            "show",
            "hosts",
            "remote"
          ],
          [
            "link",
            "gw",
            "hosts",
            {
              "tone": "file",
              "dash": 1
            }
          ],
          [
            "link",
            "gw",
            "remote",
            {
              "tone": "ok",
              "label": "ICMP"
            }
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ cat /etc/hosts"
          ],
          [
            "out",
            "term",
            "127.0.0.1 localhost",
            "192.168.1.10 prod-db01.local prod-db01",
            "192.168.1.20 db-standby"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ ping -c 3 8.8.8.8"
          ],
          [
            "flow",
            "srv",
            "remote",
            "ICMP Echo Req",
            {
              "tone": "accent",
              "dur": 500
            }
          ],
          [
            "flow",
            "remote",
            "srv",
            "Reply 14.1ms",
            {
              "tone": "ok",
              "dur": 500
            }
          ],
          [
            "out",
            "term",
            "PING 8.8.8.8 (8.8.8.8) 56(84) bytes of data.",
            "64 bytes from 8.8.8.8: icmp_seq=1 ttl=118 time=14.2 ms",
            "64 bytes from 8.8.8.8: icmp_seq=2 ttl=118 time=13.8 ms",
            "64 bytes from 8.8.8.8: icmp_seq=3 ttl=118 time=14.1 ms",
            "--- 8.8.8.8 ping statistics ---",
            "3 packets transmitted, 3 received, 0% packet loss"
          ],
          [
            "ok",
            "remote"
          ]
        ],
        "vo": "लोकल डी-बी क्लस्टर या स्टेजिंग सर्वर्स के लिए स्लैश ई-टी-सी स्लैश होस्ट्स में डायरेक्ट मैपिंग होती है। लिनक्स हमेशा डी-एन-एस से पहले स्लैश ई-टी-सी स्लैश होस्ट्स पढ़ता है!"
      }
    ],
    "points": [
      "`ip a` (ip addr) modern Linux ka standard network card diagnostic tool hai.",
      "`ip route` se pata chalta hai packets kis gateway router se bahar jaate hain.",
      "DNS issues ke liye `/etc/resolv.conf` mein nameserver check karo.",
      "Hamesha `ping -c 3` flag lagao; Linux mein ping bina count ke infinite chalta rehta hai."
    ],
    "check": {
      "q": "Server se `ping 8.8.8.8` (IP) successfully chal raha hai par `curl https://api.stripe.com` fail ho raha hai aur \"Could not resolve host\" de raha hai. Problem kahan hai?",
      "a": [
        "Network card kharab hai.",
        "DNS resolution fail ho raha hai (/etc/resolv.conf mein galat ya unreachable nameserver hai).",
        "Hard disk full hai.",
        "SSL certificate expire ho gaya hai."
      ],
      "c": 1,
      "why": "Jab direct IP reach ho raha ho par domain name resolve na ho raha ho, toh network bilkul sahi hai par DNS (Domain Name System) nameserver unreachable ya galat configured hai."
    },
    "syntax": {
      "code": "ip a                         # Show interfaces and IP addresses\nip route                     # Show routing table and default gateway\nping -c 4 <ip_or_host>       # Ping with packet count limit\ncat /etc/resolv.conf         # Check configured DNS servers\ncat /etc/hosts               # Check local host IP aliases",
      "parts": [
        [
          "ip a",
          "Replaces deprecated ifconfig."
        ],
        [
          "ip route",
          "Replaces deprecated netstat -r / route."
        ],
        [
          "-c 4",
          "Limit ping to 4 echo packets then exit cleanly."
        ]
      ]
    },
    "scenario": "Oracle RAC node 2 achanak cluster se drop ho gaya. Admin ne `ping node2` kiya toh \"Host unreachable\" aaya. `ip a` chala kar dekha toh private interconnect network card `eth1` ka state DOWN tha. Interface UP karte hi cluster synchronization restore ho gaya.",
    "tasks": [
      {
        "t": "Server ke network interfaces aur assigned IP addresses inspect karo (`ip a`).",
        "sql": "ip a"
      },
      {
        "t": "Default routing gateway check karo (`ip route`).",
        "sql": "ip route"
      },
      {
        "t": "DNS nameservers (`/etc/resolv.conf`) aur local hosts table (`/etc/hosts`) inspect karo.",
        "sql": "cat /etc/resolv.conf\ncat /etc/hosts"
      }
    ],
    "mistakes": [
      {
        "bad": "ping google.com (bina -c flag ke)",
        "err": "hangs indefinitely on Linux",
        "why": "Windows par ping 4 baar chalkar rukta hai; Linux par ping zindagi bhar chalta rehta hai jab tak `Ctrl+C` na dabao. Hamesha `ping -c 4` lagao.",
        "fix": "ping -c 4 google.com"
      },
      {
        "bad": "ifconfig use karna modern Ubuntu/RHEL par",
        "err": "command not found",
        "why": "`net-tools` (ifconfig) 10 saal pehle deprecate ho chuka hai. Enterprise Linux par hamesha `ip a` aur `ip route` use karo.",
        "fix": "ip a"
      }
    ],
    "intro": "फ़ोन कॉल मिलाने जैसा सोचो। आई-पी ए बराबर तुम्हारा अपना फ़ोन नंबर और सिम कार्ड। पिंग बराबर बेल बजा कर चेक करना कि दूसरी साइड कोई उठा रहा है या नहीं। स्लैश ई-टी-सी स्लैश होस्ट्स बराबर तुम्हारी पर्सनल कॉन्टैक्ट बुक। और स्लैश ई-टी-सी स्लैश रिज़ॉल्व डॉट कॉन्फ़ बराबर टेलीफ़ोन डायरेक्टरी जहाँ नाम बोलने पर नंबर मिलता है।"
  },
  {
    "id": "lx-ports",
    "course": "linux",
    "sec": "Networking, Ports aur Remote Access",
    "title": "ss -tulpn aur lsof -i: Kaunsa port khula hai?",
    "url": "https://man7.org/linux/man-pages/man8/ss.8.html",
    "meta": "Linux · prod-db01 · bash",
    "summary": "Port conflict aur listening sockets ka investigation: modern replacement of netstat `ss -tulpn`, TCP/UDP listening ports, specific port check `ss -tulpn | grep 1521`, port pakadne wali process dhoondhna `lsof -i :8080`, aur `Address already in use` error fix karna.",
    "simple": "Airport ke boarding gates socho. Gate 80 = Web passengers (Nginx). Gate 22 = Security staff (SSH). Gate 1521 = VIP cargo (Oracle DB). `ss -tulpn` screen par dikhata hai kaunse gates khule hain aur har gate par kaunsa guard (PID) khada hai. Agar do airlines ek hi gate maangein, toh `Address already in use` clash ho jata hai.",
    "words": [
      [
        "Socket",
        "IP address + Port number ka joda (e.g. `0.0.0.0:80` ya `127.0.0.1:1521`)."
      ],
      [
        "ss",
        "Socket Statistics: modern fast socket inspection tool (netstat ka successor)."
      ],
      [
        "-t",
        "TCP sockets."
      ],
      [
        "-u",
        "UDP sockets."
      ],
      [
        "-l",
        "Listening sockets only (jo naye connections ka wait kar rahe hain)."
      ],
      [
        "-p",
        "Process: socket open rakhne wale program ka naam aur PID dikhana."
      ],
      [
        "-n",
        "Numeric: port names (http, ssh) ke bajaye exact numbers (80, 22) dikhana."
      ],
      [
        "lsof -i :port",
        "Kisi specific port number ko open rakhne wali process dhoondhna."
      ]
    ],
    "nodes": [
      [
        "ss",
        "proc",
        24,
        42,
        230,
        56,
        "ss -tulpn / lsof -i",
        {
          "sub": "Socket & Port Inspector",
          "tone": "proc"
        }
      ],
      [
        "vp8080",
        "var",
        24,
        120,
        230,
        56,
        "Port 8080 (payapi)",
        {
          "v": "Checking...",
          "tone": "muted"
        }
      ],
      [
        "ptbl",
        "table",
        284,
        38,
        652,
        152,
        "Active Listening Sockets on prod-db01",
        {
          "cols": [
            "PROTO",
            "STATE",
            "LOCAL PORT",
            "PROCESS",
            "PID"
          ],
          "cw": [
            0.12,
            0.16,
            0.22,
            0.32,
            0.18
          ]
        }
      ],
      [
        "term",
        "term",
        24,
        210,
        912,
        300,
        "Terminal · Port Investigation"
      ]
    ],
    "code": [
      "# 1. Inspect all listening TCP and UDP ports with process names",
      "ss -tulpn",
      "# 2. Filter for Oracle Database listener port 1521",
      "ss -tulpn | grep 1521",
      "# 3. Find exactly which process is using port 80 using lsof",
      "lsof -i :80",
      "# 4. Check if payment API port 8080 is listening or free",
      "ss -tulpn | grep 8080"
    ],
    "codeTitle": "Bash · prod-db01",
    "steps": [
      {
        "say": "Application start karte waqt error: `Address already in use: bind(8080)`. Ya client bolta hai DB connect nahi ho rahi. Pehla tool: `ss -tulpn`.",
        "ops": [
          [
            "show",
            "ss",
            "vp8080",
            "ptbl",
            "term"
          ],
          [
            "link",
            "ss",
            "ptbl",
            {
              "tone": "proc"
            }
          ]
        ],
        "vo": "एप्लिकेशन स्टार्ट करते वक़्त एरर: एड्रेस ऑलरेडी इन यूज़, बाइंड एटी-एटी। या क्लाइंट बोलता है डी-बी कनेक्ट नहीं हो रही। पहला टूल: एस-एस डैश टी-यू-एल-पी-एन।"
      },
      {
        "say": "Flags yaad rakho: `t` (TCP) + `u` (UDP) + `l` (listening) + `p` (process name) + `n` (numeric ports) = `ss -tulpn`.",
        "code": [
          0,
          1
        ],
        "ops": [
          [
            "rows",
            "ptbl",
            [
              [
                "tcp",
                "LISTEN",
                "0.0.0.0:22",
                "sshd",
                "890"
              ],
              [
                "tcp",
                "LISTEN",
                "0.0.0.0:80",
                "nginx",
                "1102"
              ],
              [
                "tcp",
                "LISTEN",
                "0.0.0.0:1521",
                "tnslsnr (Oracle)",
                "1250"
              ],
              [
                "tcp",
                "CLOSED",
                "0.0.0.0:8080",
                "payapi (Not bound)",
                "-"
              ]
            ]
          ],
          [
            "mark",
            "ptbl",
            [
              0,
              1,
              2
            ],
            "ok"
          ],
          [
            "mark",
            "ptbl",
            [
              3
            ],
            "danger"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ ss -tulpn"
          ],
          [
            "out",
            "term",
            "Netid State  Recv-Q Send-Q Local Address:Port  Peer Address:Port Process",
            "tcp   LISTEN 0      128          0.0.0.0:22         0.0.0.0:*     users:((\"sshd\",pid=890,fd=3))",
            "tcp   LISTEN 0      511          0.0.0.0:80         0.0.0.0:*     users:((\"nginx\",pid=1102,fd=6))",
            "tcp   LISTEN 0      128          0.0.0.0:1521       0.0.0.0:*     users:((\"tnslsnr\",pid=1250,fd=8))"
          ]
        ],
        "vo": "फ़्लैग्स याद रखो: टी यानी टी-सी-पी, यू यानी यू-डी-पी, एल यानी लिसनिंग, पी यानी प्रोसेस नेम, एन यानी न्यूमेरिक पोर्ट्स, मिलकर बनता है एस-एस डैश टी-यू-एल-पी-एन।"
      },
      {
        "say": "Oracle DBA Check: `ss -tulpn | grep 1521` se confirm karo ki TNS Listener port 1521 par active listen kar raha hai ya nahi.",
        "code": [
          2,
          3
        ],
        "ops": [
          [
            "fade",
            "ptbl",
            [
              0,
              1,
              3
            ]
          ],
          [
            "mark",
            "ptbl",
            [
              2
            ],
            "accent"
          ],
          [
            "colhl",
            "ptbl",
            [
              2,
              3,
              4
            ],
            "accent"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ ss -tulpn | grep 1521"
          ],
          [
            "out",
            "term",
            "tcp   LISTEN 0      128          0.0.0.0:1521       0.0.0.0:*     users:((\"tnslsnr\",pid=1250,fd=8))"
          ]
        ],
        "vo": "ओरेकल डी-बी-ए चेक: एस-एस डैश टी-यू-एल-पी-एन पाइप ग्रेप फिफ्टीन ट्वेंटी-वन से कन्फ़र्म करो कि टी-एन-एस लिसनर पोर्ट फिफ्टीन ट्वेंटी-वन पर एक्टिव लिसन कर रहा है या नहीं।"
      },
      {
        "say": "Targeted Search: `lsof -i :80` seedha us process ka user, PID aur exact command nikaal deta hai jo port 80 par baithi hai.",
        "code": [
          4,
          5
        ],
        "ops": [
          [
            "unfade",
            "ptbl"
          ],
          [
            "fade",
            "ptbl",
            [
              0,
              2,
              3
            ]
          ],
          [
            "mark",
            "ptbl",
            [
              1
            ],
            "ok"
          ],
          [
            "flow",
            "ss",
            "ptbl#1",
            "lsof -i :80",
            {
              "tone": "ok",
              "dur": 550
            }
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ lsof -i :80"
          ],
          [
            "out",
            "term",
            "COMMAND  PID  USER   FD   TYPE DEVICE SIZE/OFF NODE NAME",
            "nginx   1102  root    6u  IPv4  24890      0t0  TCP *:http (LISTEN)"
          ]
        ],
        "vo": "टार्गेटेड सर्च: एल-एस-ओ-एफ़ डैश आई कोलन एटी सीधा उस प्रोसेस का यूज़र, पी-आई-डी और एग्ज़ैक्ट कमांड निकाल देता है जो पोर्ट एटी पर बैठी है।"
      },
      {
        "say": "Port 8080 check karo: agar koi output na aaye, matlab port khaali hai aur service band ya crashed hai.",
        "code": [
          6,
          7
        ],
        "ops": [
          [
            "unfade",
            "ptbl"
          ],
          [
            "colhl",
            "ptbl",
            []
          ],
          [
            "mark",
            "ptbl",
            [
              3
            ],
            "danger"
          ],
          [
            "val",
            "vp8080",
            "NO LISTENER (Down!)",
            {
              "tone": "danger"
            }
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ ss -tulpn | grep 8080"
          ],
          [
            "ok",
            "ss"
          ]
        ],
        "vo": "पोर्ट एटी-एटी चेक करो: अगर कोई आउटपुट न आए, मतलब पोर्ट खाली है और सर्विस बंद या क्रैश्ड है।"
      }
    ],
    "points": [
      "`ss -tulpn` = modern standard socket inspector (replaces old netstat).",
      "Local Address `0.0.0.0:80` matlab server sabhi network cards par port 80 accept kar raha hai.",
      "`127.0.0.1:8080` matlab port sirf local machine se accessible hai (bahar se nahi).",
      "`lsof -i :<port>` = port pakadne wale PID ko instant pakdo."
    ],
    "check": {
      "q": "Tum nayi Node.js service start karte ho aur error aata hai: `Error: listen EADDRINUSE: address already in use :::3000`. Is port ko open rakhne wali rogue process ka PID dhoondhne ke liye kaunsi command best hai?",
      "a": [
        "ps aux | grep node",
        "lsof -i :3000 ya ss -tulpn | grep 3000",
        "df -h",
        "kill -9 3000"
      ],
      "c": 1,
      "why": "`lsof -i :3000` ya `ss -tulpn | grep 3000` seedha batata hai ki port 3000 par kaunsa process aur exact PID chal raha hai, jise identify karke terminate kiya ja sake."
    },
    "syntax": {
      "code": "ss -tulpn                   # List all listening TCP/UDP ports with PIDs\nss -tulpn | grep :<port>    # Check specific port\nlsof -i :<port>             # Find process by port number\nlsof -i -P -n               # Fast list open network files",
      "parts": [
        [
          "-t",
          "TCP sockets."
        ],
        [
          "-u",
          "UDP sockets."
        ],
        [
          "-l",
          "Listening sockets."
        ],
        [
          "-p",
          "Show process using socket."
        ],
        [
          "-n",
          "Do not resolve service names (show numeric ports)."
        ]
      ]
    },
    "scenario": "Deployment team Nginx upgrade kar rahi thi par startup fail ho raha tha: \"bind() to 0.0.0.0:80 failed (98: Address already in use)\". `lsof -i :80` chalaya toh pata chala purana Apache web server background mein chalu tha. Apache stop karte hi Nginx cleanly start ho gaya.",
    "tasks": [
      {
        "t": "Server ke sabhi listening TCP ports process ID ke saath inspect karo (`ss -tulpn`).",
        "sql": "ss -tulpn"
      },
      {
        "t": "Oracle TNS listener port `1521` ka status check karo (`ss -tulpn | grep 1521`).",
        "sql": "ss -tulpn | grep 1521"
      },
      {
        "t": "Port 80 ko open rakhne wali process inspect karo (`lsof -i :80`).",
        "sql": "lsof -i :80"
      }
    ],
    "mistakes": [
      {
        "bad": "ss -tulp (bina -n ke)",
        "err": "slow DNS lookup and port names instead of numbers",
        "why": "Bina `-n` ke ss ports ko \"http\", \"ssh\", \"domain\" likhta hai jisse numeric filter (`grep 80`) fail ho sakta hai aur reverse DNS par time lagta hai. Hamesha `-n` lagao.",
        "fix": "ss -tulpn"
      },
      {
        "bad": "kill -9 80",
        "err": "killed wrong process or error",
        "why": "80 port number hai, PID nahi! Port number ko kill nahi kiya ja sakta. Pehle `lsof -i :80` se PID dhoondho fir PID kill karo.",
        "fix": "lsof -i :80 -> kill -15 <PID>"
      }
    ],
    "intro": "एयरपोर्ट के बोर्डिंग गेट्स सोचो। गेट एटी बराबर वेब पैसेंजर्स यानी इंजन-एक्स। गेट ट्वेंटी-टू बराबर सिक्योरिटी स्टाफ़ यानी एस-एस-एच। गेट फिफ्टीन ट्वेंटी-वन बराबर वी-आई-पी कार्गो यानी ओरेकल डी-बी। एस-एस डैश टी-यू-एल-पी-एन स्क्रीन पर दिखाता है कौनसे गेट्स खुले हैं और हर गेट पर कौनसा गार्ड यानी पी-आई-डी खड़ा है। अगर दो एयरलाइन्स एक ही गेट माँगें, तो एड्रेस ऑलरेडी इन यूज़ क्लैश हो जाता है।"
  },
  {
    "id": "lx-ssh-scp",
    "course": "linux",
    "sec": "Networking, Ports aur Remote Access",
    "title": "SSH Keys, ssh-copy-id aur scp: Secure remote access",
    "url": "https://www.openssh.com/manual.html",
    "meta": "Linux · prod-db01 · bash",
    "summary": "Enterprise SSH workflow: RSA/Ed25519 key pair generate karna `ssh-keygen -t ed25519`, public key server par install karna `ssh-copy-id`, `~/.ssh/authorized_keys`, file copy karna `scp`, aur `~/.ssh/config` shortcut aliases.",
    "simple": "Asli taale aur chaabi jaisa socho. Private Key (`id_ed25519`) = tumhari jeb ki personal chaabi jo kisi ko nahi deni. Public Key (`id_ed25519.pub`) = taale ka saanchha jo tum 50 alag servers ke darwaze par laga dete ho. Ab tum bina password type kiye chaabi lagate hi andar!",
    "words": [
      [
        "SSH",
        "Secure Shell: Encrypted remote terminal protocol (Port 22)."
      ],
      [
        "ssh-keygen",
        "Cryptographic public/private key pair banane ka tool."
      ],
      [
        "Private Key (~/.ssh/id_ed25519)",
        "Secret key jo hamesha tumhare computer par rehti hai (permission strictly 600)."
      ],
      [
        "Public Key (~/.ssh/id_ed25519.pub)",
        "Server ke `authorized_keys` file mein add karne wali key."
      ],
      [
        "ssh-copy-id",
        "Remote server par public key automatically append karne ka command."
      ],
      [
        "scp",
        "Secure Copy: SSH tunnel ke zariye do servers ke beech files copy karna."
      ],
      [
        "~/.ssh/config",
        "Servers ke IP, port aur key ka shorthand bookmark file."
      ]
    ],
    "nodes": [
      [
        "lap",
        "region",
        24,
        24,
        310,
        164,
        "Local Machine (~/.ssh)",
        {
          "tone": "accent",
          "sub": "ssh-keygen"
        }
      ],
      [
        "priv",
        "doc",
        42,
        64,
        130,
        68,
        "id_ed25519",
        {
          "sub": "Private (600 · Never share!)",
          "tone": "danger"
        }
      ],
      [
        "pub",
        "doc",
        188,
        64,
        130,
        68,
        "id_ed25519.pub",
        {
          "sub": "Public key (Shareable)",
          "tone": "accent"
        }
      ],
      [
        "tunnel",
        "proc",
        368,
        74,
        184,
        54,
        "SSH Tunnel (:22)",
        {
          "sub": "Ed25519 Encrypted",
          "tone": "proc"
        }
      ],
      [
        "srv",
        "region",
        586,
        24,
        350,
        164,
        "Remote Server (192.168.1.20)",
        {
          "tone": "ok",
          "sub": "Passwordless Auth"
        }
      ],
      [
        "auth",
        "doc",
        606,
        64,
        150,
        68,
        "authorized_keys",
        {
          "sub": "~/.ssh/ (600)",
          "tone": "ok"
        }
      ],
      [
        "scpbox",
        "doc",
        772,
        64,
        145,
        68,
        "/tmp/app.env",
        {
          "sub": "Transferred via scp",
          "tone": "file"
        }
      ],
      [
        "term",
        "term",
        24,
        206,
        912,
        304,
        "Terminal · SSH & Key Authentication"
      ]
    ],
    "code": [
      "# 1. Generate a modern, ultra-secure Ed25519 SSH keypair",
      "ssh-keygen -t ed25519 -C \"admin@company.com\" -f ~/.ssh/id_ed25519 -N \"\"",
      "# 2. View generated public key (safe to share)",
      "cat ~/.ssh/id_ed25519.pub",
      "# 3. Inspect authorized keys on remote server",
      "cat ~/.ssh/authorized_keys",
      "# 4. Copy file securely to remote server using scp",
      "scp app/app.env oracle@192.168.1.20:/tmp/app.env"
    ],
    "codeTitle": "Bash · prod-db01",
    "steps": [
      {
        "say": "Production rule: Passwords se SSH login karna banned hota hai (brute force attack ka khatra). Hamesha SSH Key Pair authentication use hota hai.",
        "ops": [
          [
            "show",
            "lap",
            "tunnel",
            "srv",
            "term"
          ],
          [
            "link",
            "lap",
            "tunnel",
            {
              "tone": "accent"
            }
          ],
          [
            "link",
            "tunnel",
            "srv",
            {
              "tone": "ok"
            }
          ]
        ],
        "vo": "प्रोडक्शन रूल: पासवर्ड्स से एस-एस-एच लॉगिन करना बैन्ड होता है, ब्रूट फ़ोर्स अटैक का ख़तरा रहता है। हमेशा एस-एस-एच की पेयर ऑथेंटिकेशन यूज़ होता है।"
      },
      {
        "say": "Key generate karo: `ssh-keygen -t ed25519`. Isse do files banti hain: secret private key (`id_ed25519`) aur public key (`id_ed25519.pub`).",
        "code": [
          0,
          1
        ],
        "ops": [
          [
            "show",
            "priv",
            "pub"
          ],
          [
            "lock",
            "priv"
          ],
          [
            "pulse",
            "pub"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ ssh-keygen -t ed25519 -C \"admin@company.com\" -f ~/.ssh/id_ed25519 -N \"\""
          ],
          [
            "out",
            "term",
            "Generating public/private ed25519 key pair.",
            "Your identification has been saved in /home/oracle/.ssh/id_ed25519",
            "Your public key has been saved in /home/oracle/.ssh/id_ed25519.pub"
          ]
        ],
        "vo": "की जनरेट करो: एस-एस-एच की-जेन डैश टी ई-डी पच्चीस-इक्यावन-उन्नीस। इससे दो फ़ाइल्स बनती हैं: सीक्रेट प्राइवेट की और डॉट पब वाली पब्लिक की।"
      },
      {
        "say": "Public key screen par dekho. Yeh lambi string remote server ki `~/.ssh/authorized_keys` file ke andar daali jaati hai.",
        "code": [
          2,
          3
        ],
        "ops": [
          [
            "pulse",
            "pub"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ cat ~/.ssh/id_ed25519.pub"
          ],
          [
            "out",
            "term",
            "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExampleAdminKey2026Ed25519Signature admin@company.com"
          ]
        ],
        "vo": "पब्लिक की स्क्रीन पर देखो। ये लंबी स्ट्रिंग रिमोट सर्वर की डॉट एस-एस-एच स्लैश ऑथराइज़्ड कीज़ फ़ाइल के अंदर डाली जाती है।"
      },
      {
        "say": "Shortcut: `ssh-copy-id user@server` chalao toh yeh automatically public key remote server ke `~/.ssh/authorized_keys` mein append kar deta hai.",
        "code": [
          4,
          5
        ],
        "ops": [
          [
            "show",
            "auth"
          ],
          [
            "flow",
            "pub",
            "tunnel",
            "ssh-copy-id",
            {
              "tone": "accent",
              "dur": 500
            }
          ],
          [
            "flow",
            "tunnel",
            "auth",
            "store pubkey",
            {
              "tone": "ok",
              "dur": 500
            }
          ],
          [
            "ok",
            "auth"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ cat ~/.ssh/authorized_keys"
          ],
          [
            "out",
            "term",
            "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExampleAdminKey2026Ed25519Signature admin@company.com"
          ]
        ],
        "vo": "शॉर्टकट: एस-एस-एच कॉपी आई-डी यूज़र ऐट सर्वर चलाओ तो ये ऑटोमैटिकली पब्लिक की रिमोट सर्वर के ऑथराइज़्ड कीज़ में अपेंड कर देता है।"
      },
      {
        "say": "Ab files bhejne ke liye `scp` (Secure Copy) use karo. Syntax: `scp <local_file> <user>@<server>:<remote_path>`. Bina password maange file instant transfer!",
        "code": [
          6,
          7
        ],
        "ops": [
          [
            "show",
            "scpbox"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ scp app/app.env oracle@192.168.1.20:/tmp/app.env"
          ],
          [
            "flow",
            "lap",
            "tunnel",
            "scp app.env",
            {
              "tone": "file",
              "dur": 500
            }
          ],
          [
            "flow",
            "tunnel",
            "scpbox",
            "100% 24.1KB/s",
            {
              "tone": "ok",
              "dur": 500
            }
          ],
          [
            "out",
            "term",
            "app.env                                       100%   80   24.1KB/s   00:00"
          ],
          [
            "ok",
            "scpbox"
          ],
          [
            "ok",
            "tunnel"
          ]
        ],
        "vo": "अब फ़ाइल्स भेजने के लिए एस-सी-पी यानी सिक्योर कॉपी यूज़ करो। सिंटैक्स: एस-सी-पी लोकल फ़ाइल यूज़र ऐट सर्वर कोलन रिमोट पाथ। बिना पासवर्ड माँगे फ़ाइल इंस्टेंट ट्रांसफ़र!"
      }
    ],
    "points": [
      "Private key (`id_ed25519`) kisi ke saath share mat karo (hamesha chmod 600).",
      "Public key (`id_ed25519.pub`) remote server ke `~/.ssh/authorized_keys` mein jaati hai.",
      "`ssh-copy-id` public key automate karne ka best tool hai.",
      "`scp file user@host:/path` = secure encrypted copy over SSH tunnel."
    ],
    "check": {
      "q": "SSH private key file `~/.ssh/id_rsa` ki file permission agar `644` ya `777` ho toh SSH command kya karti hai?",
      "a": [
        "Fast connect hoti hai.",
        "\"Permissions are too open\" error dekar connection reject kar deti hai.",
        "Server ko reboot kar deti hai.",
        "Password bypass kar deti hai."
      ],
      "c": 1,
      "why": "SSH client strictly enforce karta hai ki private key sirf owner padh sake (`chmod 600` ya `400`). Agar koi doosra user use padh sakta ho, toh SSH connection refuse kar deta hai."
    },
    "syntax": {
      "code": "ssh-keygen -t ed25519                  # Generate modern keypair\nssh-copy-id -i ~/.ssh/id_ed25519 user@host # Copy public key to remote\nssh user@host                          # Passwordless login\nscp file.txt user@host:/var/tmp/       # Copy local file to remote\nscp -r folder/ user@host:/var/tmp/     # Copy directory recursively",
      "parts": [
        [
          "-t ed25519",
          "Modern elliptic curve algorithm (faster and more secure than RSA)."
        ],
        [
          "authorized_keys",
          "File in ~/.ssh/ containing approved public keys."
        ],
        [
          "scp -r",
          "Recursive copy for directories."
        ]
      ]
    },
    "scenario": "Jenkins CI/CD automation server ko application server par binaries deploy karni thi. DevOps engineer ne Jenkins user ka SSH key pair banakar production server ke `authorized_keys` mein dala. Ab har git commit par pipeline bina manual password ke automatic deploy karti hai.",
    "tasks": [
      {
        "t": "Ed25519 SSH keypair generate karo (`ssh-keygen -t ed25519 -N \"\" -f ~/.ssh/id_ed25519`).",
        "sql": "ssh-keygen -t ed25519 -C \"admin@company.com\" -f ~/.ssh/id_ed25519 -N \"\"\nls -l ~/.ssh/"
      },
      {
        "t": "Generated public key inspect karo (`cat ~/.ssh/id_ed25519.pub`).",
        "sql": "cat ~/.ssh/id_ed25519.pub"
      },
      {
        "t": "Remote server ki `~/.ssh/authorized_keys` file inspect karo.",
        "sql": "cat ~/.ssh/authorized_keys"
      }
    ],
    "mistakes": [
      {
        "bad": "chmod 777 ~/.ssh aur ~/.ssh/authorized_keys",
        "err": "SSH rejects key authentication silently",
        "why": "SSH daemon strict modes follow karta hai. `~/.ssh` directory `700` honi chahiye aur `authorized_keys` `600` honi chahiye, warna SSH server key ko ignore kar deta hai.",
        "fix": "chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys"
      },
      {
        "bad": "sharing private key instead of public key",
        "err": "fatal security compromise",
        "why": "Public key (`.pub`) baanti jaati hai. Private key (bina .pub wali) hamesha secret rehti hai.",
        "fix": "share ~/.ssh/id_ed25519.pub only"
      }
    ],
    "intro": "असली ताले और चाबी जैसा सोचो। प्राइवेट की बराबर तुम्हारी जेब की पर्सनल चाबी जो किसी को नहीं देनी। पब्लिक की बराबर ताले का साँचा जो तुम पचास अलग सर्वर्स के दरवाज़े पर लगा देते हो। अब तुम बिना पासवर्ड टाइप किए चाबी लगाते ही अंदर!"
  },
  {
    "id": "lx-curl-fw",
    "course": "linux",
    "sec": "Networking, Ports aur Remote Access",
    "title": "curl, ufw aur iptables: REST APIs test karna aur firewall",
    "url": "https://curl.se/docs/manpage.html",
    "meta": "Linux · prod-db01 · bash",
    "summary": "API testing aur security perimeter: `curl` ke essential flags (`-I` headers, `-s` silent, `-v` verbose handshake, `-X POST -d JSON`), HTTP status codes inspect karna, aur firewall rules `ufw status`, `ufw allow 80/tcp`, `ufw deny from 203.0.113.9`.",
    "simple": "Server ka darbaan aur Postman socho. `curl` = Postman bina mouse ke: tum terminal se kisi bhi web API par letter bhej kar response check karte ho. Aur `ufw` (firewall) = bouncers ki list jo decide karti hai kaunse IPs aur ports ko server ke andar aane dena hai aur kise bahar hi drop karna hai.",
    "words": [
      [
        "curl",
        "Command Line URL: Web endpoints, APIs aur downloads test karne ka tool."
      ],
      [
        "curl -I",
        "Inspect HTTP response headers only (status code, server type, content-type)."
      ],
      [
        "curl -s",
        "Silent mode: progress bar hide karna (scripting ke liye zaroori)."
      ],
      [
        "curl -v",
        "Verbose: Poora DNS, TCP connection, SSL handshake aur headers dekhna."
      ],
      [
        "ufw",
        "Uncomplicated Firewall: Linux iptables/nftables ka aasan wrapper."
      ],
      [
        "ufw allow <port>",
        "Specific port par incoming traffic open karna."
      ],
      [
        "ufw deny from <IP>",
        "Rogue IP ya hacker ko server par connect hone se block karna."
      ]
    ],
    "nodes": [
      [
        "client",
        "box",
        24,
        36,
        175,
        58,
        "curl HTTP Client",
        {
          "sub": "-I headers · -s silent",
          "tone": "accent"
        }
      ],
      [
        "spam",
        "box",
        24,
        114,
        175,
        58,
        "Attacker IP",
        {
          "sub": "203.0.113.9",
          "tone": "danger"
        }
      ],
      [
        "fw",
        "table",
        235,
        36,
        420,
        148,
        "ufw Firewall Rules Table",
        {
          "cols": [
            "TO / PORT",
            "ACTION",
            "FROM SOURCE"
          ],
          "cw": [
            0.32,
            0.26,
            0.42
          ]
        }
      ],
      [
        "nginx",
        "box",
        690,
        36,
        246,
        58,
        "Nginx Web Server (:80)",
        {
          "sub": "HTTP/1.1 200 OK",
          "tone": "ok"
        }
      ],
      [
        "api",
        "proc",
        690,
        114,
        246,
        58,
        "PayAPI (:8080/health)",
        {
          "sub": "{\"status\":\"UP\"}",
          "tone": "proc"
        }
      ],
      [
        "term",
        "term",
        24,
        204,
        912,
        306,
        "Terminal · API & Firewall Controller"
      ]
    ],
    "code": [
      "# 1. Fetch HTTP response headers only (-I)",
      "curl -I http://localhost:80/",
      "# 2. Test JSON API endpoint and print formatted response",
      "curl -s http://localhost:8080/health",
      "# 3. Check current firewall status and active rules",
      "sudo ufw status",
      "# 4. Block malicious offending IP discovered in log analysis",
      "sudo ufw deny from 203.0.113.9",
      "# 5. Allow port 443 for HTTPS traffic",
      "sudo ufw allow 443/tcp"
    ],
    "codeTitle": "Bash · prod-db01",
    "steps": [
      {
        "say": "Browser kholiye bina microservices aur web servers test karne ka #1 tool `curl` hai. Sath hi firewall rules se network traffic control hota hai.",
        "ops": [
          [
            "show",
            "client",
            "fw",
            "nginx",
            "api",
            "term"
          ],
          [
            "rows",
            "fw",
            [
              [
                "22/tcp (SSH)",
                "ALLOW",
                "Anywhere"
              ],
              [
                "80/tcp (HTTP)",
                "ALLOW",
                "Anywhere"
              ],
              [
                "1521/tcp (DB)",
                "ALLOW",
                "192.168.1.0/24"
              ]
            ]
          ],
          [
            "link",
            "client",
            "fw",
            {
              "tone": "accent"
            }
          ],
          [
            "link",
            "fw",
            "nginx",
            {
              "tone": "ok"
            }
          ],
          [
            "link",
            "fw",
            "api",
            {
              "tone": "proc"
            }
          ]
        ],
        "vo": "ब्राउज़र खोले बिना माइक्रोसर्विसेज़ और वेब सर्वर्स टेस्ट करने का नंबर वन टूल कर्ल है। साथ ही फ़ायरवॉल रूल्स से नेटवर्क ट्रैफ़िक कंट्रोल होता है।"
      },
      {
        "say": "Healthcheck verify karne ke liye `curl -I` chalao. Output mein status code `HTTP/1.1 200 OK` aur web server signature dikhega.",
        "code": [
          0,
          1
        ],
        "ops": [
          [
            "term",
            "term",
            "oracle@prod-db01:~$ curl -I http://localhost:80/"
          ],
          [
            "flow",
            "client",
            "nginx",
            "HEAD :80",
            {
              "tone": "accent",
              "dur": 500
            }
          ],
          [
            "flow",
            "nginx",
            "client",
            "200 OK",
            {
              "tone": "ok",
              "dur": 500
            }
          ],
          [
            "out",
            "term",
            "HTTP/1.1 200 OK",
            "Server: nginx/1.24.0",
            "Date: Wed, 29 Oct 2026 10:50:00 GMT",
            "Content-Type: text/html; charset=UTF-8",
            "Content-Length: 612"
          ],
          [
            "ok",
            "nginx"
          ]
        ],
        "vo": "हेल्थचेक वेरिफ़ाई करने के लिए कर्ल डैश कैपिटल आई चलाओ। आउटपुट में स्टेटस कोड एच-टी-टी-पी टू हंड्रेड ओके और वेब सर्वर सिग्नेचर दिखेगा।"
      },
      {
        "say": "REST API test karne ke liye `-s` (silent) lagao taaki progress bar na aaye aur sirf clean JSON response mile.",
        "code": [
          2,
          3
        ],
        "ops": [
          [
            "term",
            "term",
            "oracle@prod-db01:~$ curl -s http://localhost:8080/health"
          ],
          [
            "flow",
            "client",
            "api",
            "GET /health",
            {
              "tone": "proc",
              "dur": 500
            }
          ],
          [
            "flow",
            "api",
            "client",
            "{\"status\":\"UP\"}",
            {
              "tone": "ok",
              "dur": 500
            }
          ],
          [
            "out",
            "term",
            "{\"status\":\"UP\",\"service\":\"payapi\",\"database\":\"connected\",\"timestamp\":\"2026-10-29T10:50:00Z\"}"
          ],
          [
            "ok",
            "api"
          ]
        ],
        "vo": "रेस्ट ए-पी-आई टेस्ट करने के लिए डैश एस यानी साइलेंट लगाओ ताकि प्रोग्रेस बार न आए और सिर्फ़ क्लीन जे-सॉन रिस्पॉन्स मिले।"
      },
      {
        "say": "Ab security perimeter dekho: `sudo ufw status` se check karo kaunse ports khule hain aur kaunse blocked hain.",
        "code": [
          4,
          5
        ],
        "ops": [
          [
            "mark",
            "fw",
            [
              0,
              1,
              2
            ],
            "ok"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ sudo ufw status"
          ],
          [
            "out",
            "term",
            "Status: active",
            "To                         Action      From",
            "--                         ------      ----",
            "22/tcp                     ALLOW       Anywhere",
            "80/tcp                     ALLOW       Anywhere",
            "1521/tcp                   ALLOW       192.168.1.0/24"
          ]
        ],
        "vo": "अब सिक्योरिटी पेरिमीटर देखो: सूडो यू-एफ़-डब्ल्यू स्टेटस से चेक करो कौनसे पोर्ट्स खुले हैं और कौनसे ब्लॉक्ड हैं।"
      },
      {
        "say": "Lesson 12 mein humne rogue IP `203.0.113.9` pakda tha. Ab firewall se use permanently block karo: `sudo ufw deny from 203.0.113.9`.",
        "code": [
          6,
          7,
          8,
          9
        ],
        "ops": [
          [
            "show",
            "spam"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ sudo ufw deny from 203.0.113.9"
          ],
          [
            "addrow",
            "fw",
            [
              "Anywhere",
              "DENY",
              "203.0.113.9 (Blocked!)"
            ],
            {
              "tone": "danger"
            }
          ],
          [
            "flow",
            "spam",
            "fw",
            "flood",
            {
              "tone": "danger",
              "dur": 450
            }
          ],
          [
            "x",
            "spam"
          ],
          [
            "out",
            "term",
            "Rule added"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ sudo ufw allow 443/tcp"
          ],
          [
            "out",
            "term",
            "Rule added (v6)"
          ],
          [
            "ok",
            "fw"
          ]
        ],
        "vo": "लेसन बारह में हमने रोग आई-पी टू ओ थ्री डॉट ज़ीरो डॉट वन थर्टीन डॉट नाइन पकड़ा था। अब फ़ायरवॉल से उसे पर्मनेंटली ब्लॉक करो: सूडो यू-एफ़-डब्ल्यू डिनाई फ़्रॉम टू ओ थ्री डॉट ज़ीरो डॉट वन थर्टीन डॉट नाइन।"
      }
    ],
    "points": [
      "`curl -I <url>` = inspect HTTP response headers and status codes.",
      "`curl -s <url>` = silent mode (perfect for bash scripts and healthchecks).",
      "`ufw status` = check firewall state and open ports.",
      "`ufw deny from <IP>` = immediate IP ban for brute-force attacks.",
      "`ufw allow 443/tcp` = open port for SSL/HTTPS."
    ],
    "check": {
      "q": "Bash monitoring script mein periodic health ping karte waqt progress meter chup karne ke liye `curl` ka kaunsa flag zaroori hai?",
      "a": [
        "-v",
        "-s (silent)",
        "-I",
        "-X"
      ],
      "c": 1,
      "why": "`-s` (silent) curl ke progress table aur transfer rate indicators ko hide karta hai, taaki log files ya bash variables mein sirf actual API output hi aaye."
    },
    "syntax": {
      "code": "curl -I http://domain.com/                # Header only\ncurl -s http://domain.com/api/data        # Silent API request\ncurl -X POST -H \"Content-Type: application/json\" -d '{\"k\":\"v\"}' url\nsudo ufw status                           # Firewall status\nsudo ufw allow 80/tcp                     # Allow HTTP\nsudo ufw deny from <bad_ip>               # Block bad actor",
      "parts": [
        [
          "-I",
          "Fetch headers only."
        ],
        [
          "-s",
          "Silent mode."
        ],
        [
          "-X POST",
          "Specify HTTP request method."
        ],
        [
          "ufw",
          "Uncomplicated firewall frontend for iptables."
        ]
      ]
    },
    "scenario": "Production incident mein web application ko DDoS attack hit kar raha tha. Nginx CPU 100% par tha. Engineer ne access log se top offending IP nikaali aur command chalayi: `sudo ufw insert 1 deny from 203.0.113.9`. Rule lagte hi rogue packets kernel level par drop ho gaye aur site instant recover ho gayi.",
    "tasks": [
      {
        "t": "Localhost port 80 ke HTTP headers inspect karo (`curl -I`).",
        "sql": "curl -I http://localhost:80/"
      },
      {
        "t": "PayAPI service ka health status test karo (`curl -s http://localhost:8080/health`).",
        "sql": "curl -s http://localhost:8080/health"
      },
      {
        "t": "Firewall status inspect karo aur offending IP `203.0.113.9` ko deny rule add karo.",
        "sql": "sudo ufw status\nsudo ufw deny from 203.0.113.9"
      }
    ],
    "mistakes": [
      {
        "bad": "ufw enable (bina port 22 allow kiye)",
        "err": "locked yourself out of SSH forever!",
        "why": "Agar port 22 (SSH) allow kiye bina `ufw enable` chala diya, toh current SSH session band hote hi server par dubara login karna namumkin ho jayega! Hamesha pehle `ufw allow 22` karo.",
        "fix": "sudo ufw allow 22 && sudo ufw enable"
      },
      {
        "bad": "curl http://api (in scripts without -s)",
        "err": "log files filled with progress percentages",
        "why": "Automated scripts mein bina `-s` ke curl har second progress meter likhta rehta hai jo logs ko bhar deta hai.",
        "fix": "curl -s http://api"
      }
    ],
    "intro": "सर्वर का दरबान और पोस्टमैन सोचो। कर्ल बराबर पोस्टमैन बिना माउस के: तुम टर्मिनल से किसी भी वेब ए-पी-आई पर लेटर भेज कर रिस्पॉन्स चेक करते हो। और यू-एफ़-डब्ल्यू यानी फ़ायरवॉल बराबर बाउंसर्स की लिस्ट जो डिसाइड करती है कौनसे आई-पीज़ और पोर्ट्स को सर्वर के अंदर आने देना है और किसे बाहर ही ड्रॉप करना है।"
  },
  {
    "id": "lx-packages",
    "course": "linux",
    "sec": "Package Management aur Automation",
    "title": "apt, dnf aur dpkg: Enterprise package management",
    "url": "https://man7.org/linux/man-pages/man8/apt.8.html",
    "meta": "Linux · prod-db01 · bash",
    "summary": "Linux par software install aur update karne ka enterprise flow: Ubuntu/Debian (`apt update`, `apt install -y`, `apt-cache search`, `dpkg -l`) vs RHEL/CentOS (`dnf / yum`), repository list `/etc/apt/sources.list`, aur automated security patches.",
    "simple": "Phone ka App Store socho. `apt update` = App Store ki nayi apps aur versions ki list refresh karna. `apt install nginx` = ek click par Nginx aur uski saari zaroori dependencies download karke install karna. Aur `dpkg -l` = check karna ki phone mein kaun kaunsi apps installed hain.",
    "words": [
      [
        "Package Manager",
        "Software aur dependencies ko compile, install, update aur remove karne ka system."
      ],
      [
        "apt",
        "Advanced Package Tool: Debian/Ubuntu ka modern CLI tool."
      ],
      [
        "dnf / yum",
        "RHEL, Rocky Linux, Fedora ka package manager."
      ],
      [
        "apt update",
        "Package repository cache refresh karna (software install nahi karta)."
      ],
      [
        "apt upgrade",
        "System par installed softwares ke naye versions install karna."
      ],
      [
        "dpkg -l",
        "System par installed packages ki poori list dekhna."
      ],
      [
        "/etc/apt/sources.list",
        "Un servers ke URLs jahan se packages download hote hain."
      ]
    ],
    "nodes": [
      [
        "repo",
        "disk",
        24,
        42,
        165,
        76,
        "Ubuntu Cloud Repo",
        {
          "sub": "Signed InRelease index",
          "inside": "Mirrors",
          "tone": "file",
          "level": 0.75
        }
      ],
      [
        "apt",
        "proc",
        225,
        58,
        175,
        56,
        "apt Package Mgr",
        {
          "sub": "update · search · clean",
          "tone": "accent"
        }
      ],
      [
        "dpkg",
        "table",
        435,
        36,
        501,
        148,
        "Local Package Database (dpkg -l)",
        {
          "cols": [
            "STATE",
            "PACKAGE",
            "VERSION",
            "DESCRIPTION"
          ],
          "cw": [
            0.14,
            0.22,
            0.24,
            0.4
          ]
        }
      ],
      [
        "term",
        "term",
        24,
        204,
        912,
        306,
        "Terminal · Package Management"
      ]
    ],
    "code": [
      "# 1. Refresh package index list from upstream repositories",
      "sudo apt update",
      "# 2. Check if specific package is already installed using dpkg",
      "dpkg -l | grep -i nginx",
      "# 3. Search package repositories for available utilities",
      "apt search htop",
      "# 4. Clean up obsolete cached package installation files (.deb)",
      "sudo apt autoremove -y"
    ],
    "codeTitle": "Bash · prod-db01",
    "steps": [
      {
        "say": "Linux par software install karne ke liye Windows ki tarah setup.exe download nahi kiya jata. Package managers dependency management aur security signing khud sambhalte hain.",
        "ops": [
          [
            "show",
            "repo",
            "apt",
            "dpkg",
            "term"
          ],
          [
            "link",
            "repo",
            "apt",
            {
              "tone": "file"
            }
          ],
          [
            "link",
            "apt",
            "dpkg",
            {
              "tone": "accent"
            }
          ],
          [
            "rows",
            "dpkg",
            [
              [
                "ii",
                "nginx",
                "1.24.0-1ubuntu1",
                "High performance web server"
              ],
              [
                "ii",
                "openssh-server",
                "1:8.9p1-3",
                "Secure shell server daemon"
              ]
            ]
          ]
        ],
        "vo": "लिनक्स पर सॉफ़्टवेयर इंस्टॉल करने के लिए विंडोज़ की तरह सेटअप डॉट ई-एक्स-ई डाउनलोड नहीं किया जाता। पैकेज मैनेजर्स डिपेंडेंसी मैनेजमेंट और सिक्योरिटी साइनिंग ख़ुद सँभालते हैं।"
      },
      {
        "say": "Important Rule: Naya software install karne se pehle hamesha `sudo apt update` chalao taaki repository index refresh ho sake.",
        "code": [
          0,
          1
        ],
        "ops": [
          [
            "term",
            "term",
            "oracle@prod-db01:~$ sudo apt update"
          ],
          [
            "flow",
            "repo",
            "apt",
            "InRelease index",
            {
              "tone": "file",
              "dur": 600
            }
          ],
          [
            "out",
            "term",
            "Hit:1 http://archive.ubuntu.com/ubuntu jammy InRelease",
            "Hit:2 http://security.ubuntu.com/ubuntu jammy-security InRelease",
            "Reading package lists... Done",
            "Building dependency tree... Done",
            "All packages are up to date."
          ],
          [
            "ok",
            "apt"
          ]
        ],
        "vo": "इम्पॉर्टेंट रूल: नया सॉफ़्टवेयर इंस्टॉल करने से पहले हमेशा सूडो ए-पी-टी अपडेट चलाओ ताकि रिपॉज़िटरी इंडेक्स रिफ़्रेश हो सके।"
      },
      {
        "say": "System par installed package check karne ke liye `dpkg -l | grep <name>` use hota hai. `ii` status ka matlab installed and configured.",
        "code": [
          2,
          3
        ],
        "ops": [
          [
            "mark",
            "dpkg",
            [
              0
            ],
            "ok"
          ],
          [
            "colhl",
            "dpkg",
            [
              0,
              1,
              2
            ],
            "ok"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ dpkg -l | grep -i nginx"
          ],
          [
            "out",
            "term",
            "ii  nginx                          1.24.0-1ubuntu1  amd64  small, powerful, scalable web server"
          ]
        ],
        "vo": "सिस्टम पर इंस्टॉल्ड पैकेज चेक करने के लिए डी-पी-के-जी डैश एल पाइप ग्रेप नेम यूज़ होता है। आई-आई स्टेटस का मतलब इंस्टॉल्ड एंड कॉन्फ़िगर्ड।"
      },
      {
        "say": "Agar package ka exact naam pata na ho, toh `apt search <keyword>` se repository search kar sakte ho.",
        "code": [
          4,
          5
        ],
        "ops": [
          [
            "colhl",
            "dpkg",
            []
          ],
          [
            "flow",
            "repo",
            "apt",
            "htop 3.2.1",
            {
              "tone": "accent",
              "dur": 550
            }
          ],
          [
            "addrow",
            "dpkg",
            [
              "avail",
              "htop",
              "3.2.1-1",
              "Interactive process viewer"
            ],
            {
              "tone": "accent"
            }
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ apt search htop"
          ],
          [
            "out",
            "term",
            "htop/jammy 3.2.1-1 amd64",
            "  interactive processes viewer and system monitor"
          ]
        ],
        "vo": "अगर पैकेज का एग्ज़ैक्ट नाम पता न हो, तो ए-पी-टी सर्च कीवर्ड से रिपॉज़िटरी सर्च कर सकते हो।"
      },
      {
        "say": "Purane unused kernels aur orphan packages ko clean karne ke liye `sudo apt autoremove` chalaya jata hai, jisse disk space bachti hai.",
        "code": [
          6,
          7
        ],
        "ops": [
          [
            "term",
            "term",
            "oracle@prod-db01:~$ sudo apt autoremove -y"
          ],
          [
            "out",
            "term",
            "0 upgraded, 0 newly installed, 0 to remove and 0 not upgraded."
          ],
          [
            "ok",
            "dpkg"
          ]
        ],
        "vo": "पुराने अनयूज़्ड कर्नल्स और ऑर्फ़न पैकेजेस को क्लीन करने के लिए सूडो ए-पी-टी ऑटो-रिमूव चलाया जाता है, जिससे डिस्क स्पेस बचती है।"
      }
    ],
    "points": [
      "`apt update` = package list refresh karo (does not install or upgrade anything).",
      "`apt install <pkg>` = package aur uski dependencies download/install karo.",
      "`dpkg -l` = system par installed sabhi packages ki list.",
      "`apt autoremove` = unneeded leftover libraries clean karke disk space bachao."
    ],
    "check": {
      "q": "`apt update` aur `apt upgrade` mein kya farq hota hai?",
      "a": [
        "Dono bilkul same hain.",
        "`apt update` sirf repository se latest package versions ki list download karta hai; `apt upgrade` un naye versions ko actual system par install karta hai.",
        "`apt update` se server reboot ho jata hai.",
        "`apt upgrade` se hard disk format ho jaati hai."
      ],
      "c": 1,
      "why": "`update` repository metadata refresh karta hai. `upgrade` actual packages ko naye version par modify/replace karta hai."
    },
    "syntax": {
      "code": "sudo apt update               # Refresh package index\nsudo apt install -y <pkg>     # Install package without prompt\nsudo apt remove <pkg>         # Remove package\ndpkg -l | grep <pkg>          # Check if installed\nsudo apt autoremove           # Remove orphan dependencies\n# RHEL / CentOS / Rocky:\nsudo dnf install <pkg>",
      "parts": [
        [
          "-y",
          "Automatic yes to prompts."
        ],
        [
          "dpkg -l",
          "Lists low-level Debian packages."
        ],
        [
          "dnf",
          "Dandified YUM (RHEL package manager)."
        ]
      ]
    },
    "scenario": "Oracle Database install karne ke liye zaroori prerequisites (binutils, gcc, libaio) install karne the. Engineer ne script chalayi: `sudo apt update && sudo apt install -y libaio1 bc net-tools`. Poori prerequisite verification pass ho gayi.",
    "tasks": [
      {
        "t": "Package repository index refresh karo (`sudo apt update`).",
        "sql": "sudo apt update"
      },
      {
        "t": "System par `nginx` package ka installed status inspect karo (`dpkg -l | grep`).",
        "sql": "dpkg -l | grep -i nginx"
      },
      {
        "t": "Unneeded packages clean karo (`sudo apt autoremove -y`).",
        "sql": "sudo apt autoremove -y"
      }
    ],
    "mistakes": [
      {
        "bad": "sudo apt install package (bina apt update ke)",
        "err": "404 Not Found on archive mirror",
        "why": "Purani repository list hone se upstream URLs badal chuke hote hain. Hamesha install se pehle `apt update` lagao.",
        "fix": "sudo apt update && sudo apt install package"
      },
      {
        "bad": "sudo apt upgrade (in production without backup)",
        "err": "critical library version bump broke DB",
        "why": "Production server par blind `apt upgrade` chalane se glibc ya kernel update ho jata hai jo enterprise software tod sakta hai. Hamesha specific package update karo.",
        "fix": "sudo apt install --only-upgrade nginx"
      }
    ],
    "intro": "फ़ोन का ऐप स्टोर सोचो। ए-पी-टी अपडेट बराबर ऐप स्टोर की नई ऐप्स और वर्ज़न्स की लिस्ट रिफ़्रेश करना। ए-पी-टी इंस्टॉल इंजन-एक्स बराबर एक क्लिक पर इंजन-एक्स और उसकी सारी ज़रूरी डिपेंडेंसीज़ डाउनलोड करके इंस्टॉल करना। और डी-पी-के-जी डैश एल बराबर चेक करना कि फ़ोन में कौन-कौनसी ऐप्स इंस्टॉल्ड हैं।"
  },
  {
    "id": "lx-cron",
    "course": "linux",
    "sec": "Package Management aur Automation",
    "title": "crontab: Production scheduled jobs aur automation",
    "url": "https://man7.org/linux/man-pages/man5/crontab.5.html",
    "meta": "Linux · prod-db01 · bash",
    "summary": "Linux automation ka master scheduler: `crontab -e` (edit), `crontab -l` (list), 5-star syntax (`* * * * *` = Minute, Hour, Day of Month, Month, Day of Week), standard patterns (every 5 min `*/5`, daily at midnight `0 0 * * *`), aur mandatory cron log redirection.",
    "simple": "Alarm clock socho jisme 5 buttons hain: 1. Minute (0-59), 2. Ghanta (0-23), 3. Taareeq (1-31), 4. Mahina (1-12), 5. Hafte ka din (0-6). Tum set karte ho \"Roz raat 2:00 baje database backup chalao\" = `0 2 * * * /scripts/backup_db.sh`. Computer bina insani madad ke roz exact time par chalata hai.",
    "words": [
      [
        "cron / crond",
        "Linux ka background daemon jo har minute schedule check karke jobs chalata hai."
      ],
      [
        "crontab -l",
        "Current user ke active scheduled jobs ki list dekhna."
      ],
      [
        "crontab -e",
        "Schedule edit karne ke liye editor kholna."
      ],
      [
        "5-Star Schedule",
        "`m h dom mon dow` (Minute, Hour, Day-of-month, Month, Day-of-week)."
      ],
      [
        "*/5 * * * *",
        "Har 5 minute par run karna."
      ],
      [
        "0 2 * * *",
        "Roz raat 2:00 AM par run karna."
      ],
      [
        "0 0 * * 0",
        "Har Sunday aadhi raat ko run karna."
      ],
      [
        "Cron Environment Trap",
        "Cron jobs minimal `PATH` ke sath chalti hain, isliye hamesha full binary paths (`/usr/bin/python3`) likhna compulsory hota hai."
      ]
    ],
    "nodes": [
      [
        "vm",
        "var",
        24,
        38,
        86,
        50,
        "1. MIN",
        {
          "v": "0",
          "tone": "accent",
          "type": "0-59"
        }
      ],
      [
        "vh",
        "var",
        120,
        38,
        86,
        50,
        "2. HOUR",
        {
          "v": "2",
          "tone": "accent",
          "type": "0-23"
        }
      ],
      [
        "vdom",
        "var",
        216,
        38,
        86,
        50,
        "3. DOM",
        {
          "v": "*",
          "tone": "muted",
          "type": "1-31"
        }
      ],
      [
        "vmon",
        "var",
        312,
        38,
        86,
        50,
        "4. MON",
        {
          "v": "*",
          "tone": "muted",
          "type": "1-12"
        }
      ],
      [
        "vdow",
        "var",
        408,
        38,
        86,
        50,
        "5. DOW",
        {
          "v": "*",
          "tone": "muted",
          "type": "0-6"
        }
      ],
      [
        "meaning",
        "chip",
        24,
        102,
        470,
        30,
        "Schedule: 0 2 * * *  =  Every Night at 02:00 AM",
        {
          "tone": "accent"
        }
      ],
      [
        "daemon",
        "proc",
        524,
        38,
        175,
        52,
        "crond Daemon",
        {
          "sub": "Wakes every 60s",
          "tone": "proc"
        }
      ],
      [
        "script",
        "box",
        524,
        110,
        195,
        58,
        "scripts/backup_db.sh",
        {
          "sub": "Automated job",
          "tone": "ok"
        }
      ],
      [
        "log",
        "doc",
        755,
        64,
        180,
        74,
        "backup.log",
        {
          "sub": ">> file.log 2>&1",
          "tone": "file"
        }
      ],
      [
        "term",
        "term",
        24,
        190,
        912,
        320,
        "Terminal · cron Automation"
      ]
    ],
    "code": [
      "# 1. List active cron jobs for current user",
      "crontab -l",
      "# 2. View system-wide scheduled cron directories",
      "ls -ld /etc/cron*",
      "# 3. Simulate adding a daily midnight backup job to crontab",
      "echo \"0 2 * * * /home/oracle/scripts/backup_db.sh >> /var/log/oracle/backup.log 2>&1\" | crontab -",
      "crontab -l",
      "# 4. View cron execution logs in syslog",
      "grep -i \"cron\" /var/log/syslog"
    ],
    "codeTitle": "Bash · prod-db01",
    "steps": [
      {
        "say": "Database backups, log rotation, cache cleaning aur reports generation sabhi Linux crontab se automate hote hain.",
        "ops": [
          [
            "show",
            "daemon",
            "script",
            "log",
            "term"
          ],
          [
            "link",
            "daemon",
            "script",
            {
              "tone": "proc"
            }
          ],
          [
            "link",
            "script",
            "log",
            {
              "label": ">> 2>&1",
              "tone": "file"
            }
          ]
        ],
        "vo": "डेटाबेस बैकअप्स, लॉग रोटेशन, कैश क्लीनिंग और रिपोर्ट्स जनरेशन सभी लिनक्स क्रॉनटैब से ऑटोमेट होते हैं।"
      },
      {
        "say": "Active jobs dekhne ke liye `crontab -l` chalao. Yahan har schedule 5 fields se shuru hota hai.",
        "code": [
          0,
          1
        ],
        "ops": [
          [
            "show",
            "vm",
            "vh",
            "vdom",
            "vmon",
            "vdow",
            "meaning"
          ],
          [
            "pulse",
            "vm",
            "vh"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ crontab -l"
          ],
          [
            "out",
            "term",
            "# Edit this file with crontab -e",
            "# m h  dom mon dow   command",
            "0 2 * * * /home/oracle/scripts/backup_db.sh >> /var/log/oracle/backup.log 2>&1",
            "*/15 * * * * /home/oracle/scripts/healthcheck.sh >> /tmp/health.log 2>&1"
          ]
        ],
        "vo": "एक्टिव जॉब्स देखने के लिए क्रॉनटैब डैश एल चलाओ। यहाँ हर शेड्यूल पाँच फ़ील्ड्स से शुरू होता है।"
      },
      {
        "say": "5 Stars ka structure yaad rakho: 1=Minute (0-59), 2=Hour (0-23), 3=Day (1-31), 4=Month (1-12), 5=Weekday (0-6, 0=Sunday). `0 2 * * *` matlab roz raat 2:00 AM.",
        "code": [
          2,
          3
        ],
        "ops": [
          [
            "label",
            "meaning",
            "System cron dirs: /etc/cron.hourly, .daily, .weekly, .monthly"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ ls -ld /etc/cron*"
          ],
          [
            "out",
            "term",
            "drwxr-xr-x 2 root root 4096 Oct 29 08:00 /etc/cron.d",
            "drwxr-xr-x 2 root root 4096 Oct 29 08:00 /etc/cron.daily",
            "drwxr-xr-x 2 root root 4096 Oct 29 08:00 /etc/cron.hourly",
            "drwxr-xr-x 2 root root 4096 Oct 29 08:00 /etc/cron.monthly",
            "drwxr-xr-x 2 root root 4096 Oct 29 08:00 /etc/cron.weekly"
          ]
        ],
        "vo": "पाँच स्टार्स का स्ट्रक्चर याद रखो: पहला मिनट ज़ीरो से फिफ्टी-नाइन, दूसरा आवर ज़ीरो से ट्वेंटी-थ्री, तीसरा डे वन से थर्टी-वन, चौथा मंथ वन से ट्वेल्व, पाँचवाँ वीकडे ज़ीरो से सिक्स जहाँ ज़ीरो संडे है। ज़ीरो टू स्टार स्टार स्टार मतलब रोज़ रात दो ए-एम।"
      },
      {
        "say": "Golden Production Rule: Cron job ke aakhir mein hamesha `>> /path/file.log 2>&1` lagao! Agar redirect nahi kiya, toh cron output kho jayega aur failure ka pata nahi chalega.",
        "code": [
          4,
          5
        ],
        "ops": [
          [
            "label",
            "meaning",
            "Installed: 0 2 * * * backup_db.sh >> backup.log 2>&1"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ echo \"0 2 * * * /home/oracle/scripts/backup_db.sh >> /var/log/oracle/backup.log 2>&1\" | crontab -"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ crontab -l"
          ],
          [
            "out",
            "term",
            "0 2 * * * /home/oracle/scripts/backup_db.sh >> /var/log/oracle/backup.log 2>&1"
          ],
          [
            "ok",
            "daemon"
          ]
        ],
        "vo": "गोल्डन प्रोडक्शन रूल: क्रॉन जॉब के आख़िर में हमेशा डबल ग्रेटर-दैन स्लैश पाथ स्लैश फ़ाइल डॉट लॉग टू ग्रेटर-दैन एम्परसैंड वन लगाओ! अगर रीडायरेक्ट नहीं किया, तो क्रॉन आउटपुट खो जाएगा और फ़ेल्योर का पता नहीं चलेगा।"
      },
      {
        "say": "Job chali ya nahi yeh dekhne ke liye `/var/log/syslog` mein CRON entries dekhi jaati hain.",
        "code": [
          6,
          7
        ],
        "ops": [
          [
            "term",
            "term",
            "oracle@prod-db01:~$ grep -i \"cron\" /var/log/syslog"
          ],
          [
            "flow",
            "daemon",
            "script",
            "CMD trigger",
            {
              "tone": "proc",
              "dur": 500
            }
          ],
          [
            "flow",
            "script",
            "log",
            ">> backup.log",
            {
              "tone": "ok",
              "dur": 500
            }
          ],
          [
            "out",
            "term",
            "Oct 29 09:00:01 prod-db01 CRON[1200]: (root) CMD (/usr/lib/x86_64-linux-gnu/sa/sa1 1 1)",
            "Oct 29 10:00:01 prod-db01 CRON[1350]: (oracle) CMD (/home/oracle/scripts/backup_db.sh)"
          ],
          [
            "ok",
            "script"
          ],
          [
            "ok",
            "log"
          ]
        ],
        "vo": "जॉब चली या नहीं ये देखने के लिए स्लैश वार स्लैश लॉग स्लैश सिसलॉग में क्रॉन एंट्रीज़ देखी जाती हैं।"
      }
    ],
    "points": [
      "5 stars order: Minute, Hour, Day of Month, Month, Day of Week.",
      "`*/10 * * * *` = har 10 minute par execute karo.",
      "`0 3 * * *` = roz subah 3:00 baje execute karo.",
      "Cron jobs mein hamesha absolute paths (`/usr/bin/curl`) use karo.",
      "`>> /path/to/log 2>&1` lagana compulsory hai taaki status capture ho sake."
    ],
    "check": {
      "q": "Tum chahte ho ki ek script har Monday subah 6:30 AM par automatically chale. Crontab ka sahi expression kaunsa hoga?",
      "a": [
        "* 6 30 * 1",
        "30 6 * * 1",
        "6 30 * * 1",
        "30 6 1 * *"
      ],
      "c": 1,
      "why": "Pehla field Minute (30), doosra field Hour (6), teesra Day (*), chautha Month (*), paanchwa Day of Week (1 = Monday)."
    },
    "syntax": {
      "code": "# ┌───────────── minute (0 - 59)\n# │ ┌───────────── hour (0 - 23)\n# │ │ ┌───────────── day of month (1 - 31)\n# │ │ │ ┌───────────── month (1 - 12)\n# │ │ │ │ ┌───────────── day of week (0 - 6) (Sunday=0)\n# * * * * * <command-to-execute>\n\ncrontab -l                 # View jobs\ncrontab -e                 # Edit jobs\ncrontab -r                 # Remove all jobs",
      "parts": [
        [
          "crontab -l",
          "List crontab entries."
        ],
        [
          "crontab -e",
          "Safe editor for crontab."
        ],
        [
          ">> log 2>&1",
          "Captures all standard output and errors into log file."
        ]
      ]
    },
    "scenario": "Junior engineer ne script crontab mein dali par script chali nahi, jabki terminal se manual chalu karne par chal rahi thi. Senior ne bataya ki cron ke paas `$PATH` nahi hota, isliye `python script.py` fail ho raha tha. Script mein `/usr/bin/python3 /full/path/script.py` likhte hi cron chalne laga.",
    "tasks": [
      {
        "t": "Current user ke active cron schedules list karo (`crontab -l`).",
        "sql": "crontab -l"
      },
      {
        "t": "System-wide cron directories inspect karo (`ls -ld /etc/cron*`).",
        "sql": "ls -ld /etc/cron*"
      },
      {
        "t": "`/var/log/syslog` se cron execution logs dhoondho (`grep -i cron`).",
        "sql": "grep -i \"cron\" /var/log/syslog"
      }
    ],
    "mistakes": [
      {
        "bad": "crontab -r (mistakenly instead of -e)",
        "err": "deleted all scheduled jobs instantly!",
        "why": "`-r` (remove) saare cron jobs bina prompt ke delete kar deta hai! Isliye hamesha pehle `crontab -l > my_cron.bak` se backup rakha karo.",
        "fix": "crontab -l > cron_backup.txt"
      },
      {
        "bad": "0 2 * * * python3 backup.py",
        "err": "command not found in cron mail",
        "why": "Cron environment minimal hota hai; relative paths aur PATH variable available nahi hote. Hamesha `/usr/bin/python3 /home/oracle/backup.py` likho.",
        "fix": "0 2 * * * /usr/bin/python3 /home/oracle/backup.py"
      }
    ],
    "intro": "अलार्म क्लॉक सोचो जिसमें पाँच बटन्स हैं: पहला मिनट ज़ीरो से फिफ्टी-नाइन, दूसरा घंटा ज़ीरो से ट्वेंटी-थ्री, तीसरा तारीख़ वन से थर्टी-वन, चौथा महीना वन से ट्वेल्व, पाँचवाँ हफ़्ते का दिन ज़ीरो से सिक्स। तुम सेट करते हो रोज़ रात दो बजे डेटाबेस बैकअप चलाओ बराबर ज़ीरो टू स्टार स्टार स्टार स्लैश स्क्रिप्ट्स स्लैश बैकअप डी-बी डॉट एस-एच। कंप्यूटर बिना इंसानी मदद के रोज़ एग्ज़ैक्ट टाइम पर चलाता है।"
  },
  {
    "id": "lx-env-path",
    "course": "linux",
    "sec": "Package Management aur Automation",
    "title": "Environment Variables, .bashrc aur $PATH mastery",
    "url": "https://www.gnu.org/software/bash/manual/html_node/Environment.html",
    "meta": "Linux · prod-db01 · bash",
    "summary": "Linux environment architecture: `$PATH`, `export VAR=\"value\"`, system variables (`$HOME`, `$USER`, `$SHELL`), Oracle variables (`$ORACLE_HOME`, `$ORACLE_SID`), `.bashrc` vs `.bash_profile`, aur `source ~/.bashrc` se instant reload.",
    "simple": "Dukan ka toolkit socho. `$PATH` = wo darwaze jahan bash kisi tool ka naam sunte hi dhoondhne daudta hai (jaise `/usr/bin`, `/usr/local/bin`). Agar tool ka folder `$PATH` mein nahi hai, toh computer bolega \"command not found\". Aur `.bashrc` = tumhari personal notebook jisme likhe rules har naye terminal kholte hi load ho jaate hain.",
    "words": [
      [
        "Environment Variable",
        "System ya shell level key-value pair jo running programs ko configuration deta hai."
      ],
      [
        "export",
        "Variable ko child processes aur subshells ke liye accessible banana."
      ],
      [
        "$PATH",
        "Colon-separated directories jahan terminal binary commands search karta hai."
      ],
      [
        "$ORACLE_HOME",
        "Oracle binaries aur libraries ka base directory."
      ],
      [
        "$ORACLE_SID",
        "System Identifier: Active Oracle database instance ka naam."
      ],
      [
        "~/.bashrc",
        "Non-login interactive shell startup script (aliases & env vars)."
      ],
      [
        "source ~/.bashrc",
        "Bina terminal band kiye `.bashrc` ke naye changes reload karna."
      ]
    ],
    "nodes": [
      [
        "bashrc",
        "doc",
        24,
        42,
        185,
        86,
        "~/.bashrc",
        {
          "sub": "Persistent shell config",
          "tone": "file"
        }
      ],
      [
        "source",
        "proc",
        240,
        58,
        165,
        52,
        "source ~/.bashrc",
        {
          "sub": "Apply without logout",
          "tone": "proc"
        }
      ],
      [
        "vpath",
        "var",
        440,
        34,
        496,
        48,
        "$PATH (Executable Lookup Order)",
        {
          "v": "/u01/.../dbhomeFree/bin:/usr/local/bin:/usr/bin:/bin",
          "tone": "accent"
        }
      ],
      [
        "vora",
        "var",
        440,
        102,
        240,
        52,
        "$ORACLE_SID / $ORACLE_HOME",
        {
          "v": "FREE · 23ai dbhomeFree",
          "tone": "ok"
        }
      ],
      [
        "venv",
        "var",
        700,
        102,
        236,
        52,
        "$APP_ENV (export)",
        {
          "v": "(unset)",
          "tone": "muted"
        }
      ],
      [
        "term",
        "term",
        24,
        194,
        912,
        316,
        "Terminal · Environment Variables"
      ]
    ],
    "code": [
      "# 1. Print current PATH variable directories",
      "echo $PATH",
      "# 2. Check essential Oracle environment variables",
      "echo \"ORACLE_HOME: $ORACLE_HOME | ORACLE_SID: $ORACLE_SID\"",
      "# 3. Export a temporary variable for current session",
      "export APP_ENV=production",
      "echo $APP_ENV",
      "# 4. View Oracle configuration section in ~/.bashrc",
      "tail -n 8 ~/.bashrc",
      "# 5. Reload configuration instantly without logging out",
      "source ~/.bashrc"
    ],
    "codeTitle": "Bash · prod-db01",
    "steps": [
      {
        "say": "Jab tum `ls` ya `sqlplus` likhte ho, Linux ko kaise pata chalta hai ki binary kahan rakhi hai? `$PATH` variable se!",
        "ops": [
          [
            "show",
            "bashrc",
            "source",
            "vpath",
            "term"
          ],
          [
            "link",
            "bashrc",
            "source",
            {
              "tone": "file"
            }
          ],
          [
            "link",
            "source",
            "vpath",
            {
              "tone": "proc"
            }
          ]
        ],
        "vo": "जब तुम एल-एस या सीक्वल-प्लस लिखते हो, लिनक्स को कैसे पता चलता है कि बाइनरी कहाँ रखी है? डॉलर पाथ वेरिएबल से!"
      },
      {
        "say": "`echo $PATH` chalao: yeh colon `:` separated folders hain jaise `/usr/bin:/bin:/u01/app/oracle/product/23ai/dbhomeFree/bin`.",
        "code": [
          0,
          1
        ],
        "ops": [
          [
            "pulse",
            "vpath"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ echo $PATH"
          ],
          [
            "out",
            "term",
            "/u01/app/oracle/product/23ai/dbhomeFree/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
          ]
        ],
        "vo": "इको डॉलर पाथ चलाओ: ये कोलन सेपरेटेड फ़ोल्डर्स हैं जैसे स्लैश यू-एस-आर स्लैश बिन कोलन स्लैश बिन कोलन ओरेकल होम बिन।"
      },
      {
        "say": "Oracle DBA ke liye `$ORACLE_HOME` aur `$ORACLE_SID` set hona compulsory hai, warna `sqlplus / as sysdba` chalane par `ORA-12162` error aayega.",
        "code": [
          2,
          3
        ],
        "ops": [
          [
            "show",
            "vora"
          ],
          [
            "ok",
            "vora"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ echo \"ORACLE_HOME: $ORACLE_HOME | ORACLE_SID: $ORACLE_SID\""
          ],
          [
            "out",
            "term",
            "ORACLE_HOME: /u01/app/oracle/product/23ai/dbhomeFree | ORACLE_SID: FREE"
          ]
        ],
        "vo": "ओरेकल डी-बी-ए के लिए डॉलर ओरेकल होम और डॉलर ओरेकल एस-आई-डी सेट होना कंपल्सरी है, वरना सीक्वल-प्लस स्लैश ऐज़ सिस-डी-बी-ए चलाने पर ओ-आर-ए ट्वेल्व वन सिक्सटी-टू एरर आएगा।"
      },
      {
        "say": "Variable set karne ke liye `export VAR=value` use kiya jata hai. Bina `export` ke yeh sirf current shell tak rehta hai aur script ya program ko nahi milta.",
        "code": [
          4,
          5,
          6
        ],
        "ops": [
          [
            "show",
            "venv"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ export APP_ENV=production"
          ],
          [
            "val",
            "venv",
            "production (exported)",
            {
              "tone": "ok"
            }
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ echo $APP_ENV"
          ],
          [
            "out",
            "term",
            "production"
          ]
        ],
        "vo": "वेरिएबल सेट करने के लिए एक्सपोर्ट वार बराबर वैल्यू यूज़ किया जाता है। बिना एक्सपोर्ट के ये सिर्फ़ करंट शेल तक रहता है और स्क्रिप्ट या प्रोग्राम को नहीं मिलता।"
      },
      {
        "say": "Variables ko permanent banane ke liye `~/.bashrc` ke aakhir mein add kiya jata hai, aur `source ~/.bashrc` se foran apply ho jata hai bina logout kiye.",
        "code": [
          7,
          8,
          9,
          10
        ],
        "ops": [
          [
            "term",
            "term",
            "oracle@prod-db01:~$ tail -n 8 ~/.bashrc"
          ],
          [
            "out",
            "term",
            "# Oracle Database Environment Settings",
            "export ORACLE_BASE=/u01/app/oracle",
            "export ORACLE_HOME=$ORACLE_BASE/product/23ai/dbhomeFree",
            "export ORACLE_SID=FREE",
            "export PATH=$PATH:$ORACLE_HOME/bin"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ source ~/.bashrc"
          ],
          [
            "flow",
            "bashrc",
            "source",
            "load",
            {
              "tone": "file",
              "dur": 450
            }
          ],
          [
            "flow",
            "source",
            "vpath",
            "updated!",
            {
              "tone": "ok",
              "dur": 500
            }
          ],
          [
            "ok",
            "bashrc"
          ],
          [
            "ok",
            "source"
          ]
        ],
        "vo": "वेरिएबल्स को पर्मनेंट बनाने के लिए डॉट बैश-आर-सी के आख़िर में ऐड किया जाता है, और सोर्स डॉट बैश-आर-सी से फ़ौरन अप्लाई हो जाता है बिना लॉगआउट किए।"
      }
    ],
    "points": [
      "`$PATH` directories ki ordered list hai jahan Linux executable binaries dhoondhta hai.",
      "`export VAR=\"value\"` = variable ko child processes ke liye available banao.",
      "DBA life: `$ORACLE_HOME` aur `$ORACLE_SID` hamesha `.bashrc` mein set hone chahiye.",
      "`source ~/.bashrc` (ya `. ~/.bashrc`) se configuration instantly reload ho jaati hai."
    ],
    "check": {
      "q": "Tumne ek naya software `/opt/mytool/bin/mytool` install kiya. Terminal par `mytool` likhne par `command not found` aata hai, par `/opt/mytool/bin/mytool` likhne par chal padta hai. Is issue ko permanently fix karne ka sahi tareeqa kya hai?",
      "a": [
        "Poore server par chmod 777 chala do.",
        "`~/.bashrc` mein `export PATH=$PATH:/opt/mytool/bin` add karke `source ~/.bashrc` karo.",
        "Server reboot karo.",
        "mytool ko delete karke dubara install karo."
      ],
      "c": 1,
      "why": "Terminal sirf `$PATH` mein maujood directories mein commands dhoondhta hai. `/opt/mytool/bin` ko `$PATH` mein append karne se binary har jagah se direct naam se chalegi."
    },
    "syntax": {
      "code": "echo $PATH                       # Inspect search directories\nexport VAR=\"value\"               # Set environment variable\nenv                              # List all environment variables\nexport PATH=\"$PATH:/new/path\"    # Append new directory to PATH\nsource ~/.bashrc                 # Reload config in current shell",
      "parts": [
        [
          "export",
          "Exports variable to environment of subsequently executed commands."
        ],
        [
          "$PATH",
          "Colon-separated binary lookup list."
        ],
        [
          "source",
          "Executes script in current shell context instead of a subshell."
        ]
      ]
    },
    "scenario": "Naye DBA ne server par login kiya aur `sqlplus / as sysdba` chalaya toh error aaya: `ERROR: ORA-12162: TNS:net service name is incorrectly specified`. Pata chala `$ORACLE_SID` set nahi tha. Usne `export ORACLE_SID=FREE` kiya aur `sqlplus` foran connect ho gaya.",
    "tasks": [
      {
        "t": "Current `$PATH` variable inspect karo (`echo $PATH`).",
        "sql": "echo $PATH"
      },
      {
        "t": "Oracle environment variables (`$ORACLE_HOME` aur `$ORACLE_SID`) print karo.",
        "sql": "echo \"ORACLE_HOME: $ORACLE_HOME | ORACLE_SID: $ORACLE_SID\""
      },
      {
        "t": "`~/.bashrc` file ke aakhir ke 8 lines inspect karo (`tail -n 8 ~/.bashrc`).",
        "sql": "tail -n 8 ~/.bashrc"
      }
    ],
    "mistakes": [
      {
        "bad": "export PATH=/opt/bin (without $PATH:)",
        "err": "overwrote entire PATH: ls, cat, cd stopped working!",
        "why": "Agar `$PATH` include na kiya jaye, toh saare system paths (`/bin`, `/usr/bin`) gayab ho jaate hain aur `ls` tak band ho jata hai! Hamesha `export PATH=$PATH:/opt/bin` likho.",
        "fix": "export PATH=$PATH:/opt/bin"
      },
      {
        "bad": "VAR=\"val\" (bina export ke script mein use karna)",
        "err": "child script did not receive variable",
        "why": "Normal assignment sirf current shell memory mein rehti hai. Child scripts ko pass karne ke liye `export` lagana compulsory hai.",
        "fix": "export VAR=\"val\""
      }
    ],
    "intro": "दुकान का टूलकिट सोचो। डॉलर पाथ बराबर वो दरवाज़े जहाँ बैश किसी टूल का नाम सुनते ही ढूँढने दौड़ता है, जैसे स्लैश यू-एस-आर स्लैश बिन और स्लैश यू-एस-आर स्लैश लोकल स्लैश बिन। अगर टूल का फ़ोल्डर डॉलर पाथ में नहीं है, तो कंप्यूटर बोलेगा कमांड नॉट फ़ाउंड। और डॉट बैश-आर-सी बराबर तुम्हारी पर्सनल नोटबुक जिसमें लिखे रूल्स हर नया टर्मिनल खोलते ही लोड हो जाते हैं।"
  },
  {
    "id": "lx-bash-1",
    "course": "linux",
    "sec": "Package Management aur Automation",
    "title": "Bash Scripting Foundation: Variables, $? aur if-else",
    "url": "https://www.gnu.org/software/bash/manual/html_node/Bash-Conditional-Expressions.html",
    "meta": "Linux · prod-db01 · bash",
    "summary": "Production automation scripting ki neev: Shebang line `#!/bin/bash`, variables, command exit status `$?` (0 = Success, non-zero = Failure), conditional tests `[ -f file ]` aur `[ -d dir ]`, `if-then-else-fi` blocks, aur error handling `set -e`.",
    "simple": "Traffic signal socho. Har command chalne ke baad ek hidden parchi chhodti hai jiska naam hai `$?` (exit code). Agar parchi par `0` likha hai = Green light (Success). Agar `1` ya `127` likha hai = Red light (Error). `if-else` is parchi ko dekh kar faisla leta hai: \"Agar backup pass hua toh email bhejo, agar fail hua toh siren bajao\".",
    "words": [
      [
        "#!/bin/bash (Shebang)",
        "Script ki pehli line jo OS ko batati hai ki is script ko bash interpreter se run karna hai."
      ],
      [
        "$? (Exit Status)",
        "Pichhli command ka result code (0 = success, 1 to 255 = error)."
      ],
      [
        "[ -f file ]",
        "Test: kya file exist karti hai aur regular file hai."
      ],
      [
        "[ -d dir ]",
        "Test: kya directory exist karti hai."
      ],
      [
        "[ -z \"$var\" ]",
        "Test: kya variable khaali (empty string) hai."
      ],
      [
        "if ... then ... else ... fi",
        "Bash ka conditional branch structure."
      ],
      [
        "set -e (errexit)",
        "DevOps best practice: script mein koi bhi command fail ho toh script foran ruk jaye."
      ]
    ],
    "nodes": [
      [
        "cmd",
        "box",
        24,
        58,
        190,
        64,
        "Run Command",
        {
          "sub": "ls / systemctl",
          "tone": "accent"
        }
      ],
      [
        "vexit",
        "var",
        250,
        62,
        165,
        56,
        "$? (Exit Code)",
        {
          "v": "0",
          "tone": "proc"
        }
      ],
      [
        "branch",
        "proc",
        455,
        62,
        195,
        56,
        "if [ $? -eq 0 ]",
        {
          "sub": "Conditional branch",
          "tone": "file"
        }
      ],
      [
        "pass",
        "box",
        700,
        26,
        236,
        56,
        "then -> [OK] Branch",
        {
          "sub": "Exit code 0 (Success)",
          "tone": "ok"
        }
      ],
      [
        "fail",
        "box",
        700,
        102,
        236,
        56,
        "else -> [FAIL] Branch",
        {
          "sub": "Non-zero 1..255 (Error!)",
          "tone": "danger"
        }
      ],
      [
        "term",
        "term",
        24,
        194,
        912,
        316,
        "Terminal · Bash Logic & Exit Codes"
      ]
    ],
    "code": [
      "# 1. Successful command returns exit code 0",
      "ls /var/log/syslog",
      "echo \"Exit code: $?\"",
      "# 2. Failed command returns non-zero exit code (e.g. 2)",
      "ls /nonexistent_folder_xyz 2> /dev/null",
      "echo \"Exit code: $?\"",
      "# 3. Test if a file exists using [ -f ... ]",
      "if [ -f /var/log/syslog ]; then echo \"File exists!\"; else echo \"Missing!\"; fi",
      "# 4. View simple bash healthcheck script with if-else",
      "cat scripts/healthcheck.sh"
    ],
    "codeTitle": "Bash · prod-db01",
    "steps": [
      {
        "say": "Har senior DevOps engineer script likhne se pehle exit codes aur conditionals samajhta hai. Linux mein har command chalne ke baad `$?` set karti hai.",
        "ops": [
          [
            "show",
            "cmd",
            "vexit",
            "branch",
            "pass",
            "fail",
            "term"
          ],
          [
            "link",
            "cmd",
            "vexit",
            {
              "tone": "accent"
            }
          ],
          [
            "link",
            "vexit",
            "branch",
            {
              "tone": "proc"
            }
          ],
          [
            "link",
            "branch",
            "pass",
            {
              "label": "0",
              "tone": "ok"
            }
          ],
          [
            "link",
            "branch",
            "fail",
            {
              "label": "!= 0",
              "tone": "danger"
            }
          ]
        ],
        "vo": "हर सीनियर डेव-ऑप्स इंजीनियर स्क्रिप्ट लिखने से पहले एग्ज़िट कोड्स और कंडीशनल्स समझता है। लिनक्स में हर कमांड चलने के बाद डॉलर क्वेश्चन-मार्क सेट करती है।"
      },
      {
        "say": "`ls /var/log/syslog` chalao aur foran `echo $?` karo. Result `0` aayega (Success).",
        "code": [
          0,
          1,
          2
        ],
        "ops": [
          [
            "label",
            "cmd",
            "ls /var/log/syslog",
            "File found"
          ],
          [
            "dim",
            "fail"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ ls /var/log/syslog"
          ],
          [
            "out",
            "term",
            "/var/log/syslog"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ echo \"Exit code: $?\""
          ],
          [
            "flow",
            "cmd",
            "vexit",
            "0",
            {
              "tone": "ok",
              "dur": 450
            }
          ],
          [
            "val",
            "vexit",
            "0 (Success)",
            {
              "tone": "ok"
            }
          ],
          [
            "flow",
            "branch",
            "pass",
            "0 == 0",
            {
              "tone": "ok",
              "dur": 500
            }
          ],
          [
            "out",
            "term",
            "Exit code: 0"
          ],
          [
            "ok",
            "pass"
          ]
        ],
        "vo": "एल-एस स्लैश वार स्लैश लॉग स्लैश सिसलॉग चलाओ और फ़ौरन इको डॉलर क्वेश्चन-मार्क करो। रिज़ल्ट ज़ीरो आएगा, यानी सक्सेस।"
      },
      {
        "say": "Ab galat folder `ls /nonexistent_folder_xyz` chalao aur `echo $?` karo. Result `2` aayega (Error). Har non-zero code error hota hai.",
        "code": [
          3,
          4,
          5
        ],
        "ops": [
          [
            "undim",
            "fail"
          ],
          [
            "unok",
            "pass"
          ],
          [
            "dim",
            "pass"
          ],
          [
            "label",
            "cmd",
            "ls /nonexistent_xyz",
            "Missing path!"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ ls /nonexistent_folder_xyz 2> /dev/null"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ echo \"Exit code: $?\""
          ],
          [
            "flow",
            "cmd",
            "vexit",
            "2",
            {
              "tone": "danger",
              "dur": 450
            }
          ],
          [
            "val",
            "vexit",
            "2 (Error!)",
            {
              "tone": "danger"
            }
          ],
          [
            "flow",
            "branch",
            "fail",
            "2 != 0",
            {
              "tone": "danger",
              "dur": 500
            }
          ],
          [
            "out",
            "term",
            "Exit code: 2"
          ],
          [
            "x",
            "fail"
          ]
        ],
        "vo": "अब ग़लत फ़ोल्डर एल-एस स्लैश नॉन-एग्ज़िस्टेंट फ़ोल्डर चलाओ और इको डॉलर क्वेश्चन-मार्क करो। रिज़ल्ट टू आएगा, यानी एरर। हर नॉन-ज़ीरो कोड एरर होता है।"
      },
      {
        "say": "File checking condition: `[ -f <file> ]` check karta hai file maujood hai ya nahi. `if ... then ... else ... fi` se flow control hota hai.",
        "code": [
          6,
          7
        ],
        "ops": [
          [
            "unx",
            "fail"
          ],
          [
            "undim",
            "pass"
          ],
          [
            "dim",
            "fail"
          ],
          [
            "label",
            "branch",
            "if [ -f /var/log/syslog ]",
            "File existence test"
          ],
          [
            "flow",
            "branch",
            "pass",
            "-f true",
            {
              "tone": "ok",
              "dur": 500
            }
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ if [ -f /var/log/syslog ]; then echo \"File exists!\"; else echo \"Missing!\"; fi"
          ],
          [
            "out",
            "term",
            "File exists!"
          ],
          [
            "ok",
            "pass"
          ]
        ],
        "vo": "फ़ाइल चेकिंग कंडीशन: ब्रैकेट डैश एफ़ फ़ाइल चेक करता है फ़ाइल मौजूद है या नहीं। इफ़ देन एल्स एफ़-आई से फ़्लो कंट्रोल होता है।"
      },
      {
        "say": "`scripts/healthcheck.sh` ko inspect karo: dekho kaise exit code aur if-else se automated status reporting banayi gayi hai.",
        "code": [
          8,
          9
        ],
        "ops": [
          [
            "undim",
            "fail"
          ],
          [
            "label",
            "branch",
            "if systemctl is-active nginx",
            "Production healthcheck.sh"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ cat scripts/healthcheck.sh"
          ],
          [
            "out",
            "term",
            "#!/bin/bash",
            "# Service healthcheck script",
            "if systemctl is-active --quiet nginx; then",
            "  echo \"[OK] Nginx is running\"",
            "else",
            "  echo \"[FAIL] Nginx is down!\"",
            "fi"
          ],
          [
            "ok",
            "branch"
          ]
        ],
        "vo": "स्क्रिप्ट्स स्लैश हेल्थचेक डॉट एस-एच को इंस्पेक्ट करो: देखो कैसे एग्ज़िट कोड और इफ़-एल्स से ऑटोमेटेड स्टेटस रिपोर्टिंग बनाई गई है।"
      }
    ],
    "points": [
      "`$? == 0` ka matlab command 100% kamiyab hui (Success).",
      "`$? != 0` ka matlab koi error ya exception aaya (Failure).",
      "`[ -f file ]` = file check; `[ -d dir ]` = directory check.",
      "Bash if condition `fi` par khatam hoti hai (if spelled backwards).",
      "Bracket ke andar spaces hona mandatory hai: `[ -f file ]`, bina spaces syntax error deta hai."
    ],
    "check": {
      "q": "Linux bash script mein pichhli executed command successful hui ya fail, yeh check karne ke liye kaunsa special variable use hota hai?",
      "a": [
        "$!",
        "$$",
        "$?",
        "$0"
      ],
      "c": 2,
      "why": "`$?` hamesha sabse aakhri command ka exit code (0 for success, 1-255 for error) hold karta hai."
    },
    "syntax": {
      "code": "#!/bin/bash\ncmd\nif [ $? -eq 0 ]; then\n  echo \"Success\"\nelse\n  echo \"Failed\"\n  exit 1\nfi\n\n# File existence test:\nif [ -f \"/path/to/file\" ]; then ... fi",
      "parts": [
        [
          "$?",
          "Exit status of last executed command."
        ],
        [
          "-eq 0",
          "Equal to zero."
        ],
        [
          "-f",
          "Returns true if file exists and is regular file."
        ],
        [
          "-d",
          "Returns true if directory exists."
        ]
      ]
    },
    "scenario": "CI/CD pipeline mein unit tests run hone ke baad database migrate karna tha. Script mein check tha: `./run_tests.sh; if [ $? -ne 0 ]; then echo \"Tests failed! Aborting deployment.\"; exit 1; fi`. Is check ki wajah se buggy code production par jaane se bach gaya.",
    "tasks": [
      {
        "t": "`/var/log/syslog` file ka `ls` chala kar uska exit code `$?` print karo.",
        "sql": "ls /var/log/syslog\necho \"Exit: $?\""
      },
      {
        "t": "Check karo ki `/etc/hosts` file exist karti hai ya nahi (`if [ -f ... ]`).",
        "sql": "if [ -f /etc/hosts ]; then echo \"hosts exists\"; else echo \"not found\"; fi"
      },
      {
        "t": "`scripts/healthcheck.sh` inspect karo aur execute karo (`./scripts/healthcheck.sh`).",
        "sql": "cat scripts/healthcheck.sh\n./scripts/healthcheck.sh"
      }
    ],
    "mistakes": [
      {
        "bad": "if [-f /etc/hosts]",
        "err": "bash: [-f: command not found",
        "why": "`[` bash mein koi symbol nahi balki actual command (`test`) hai! Bracket ke baad space hona mandatory hai: `if [ -f /etc/hosts ]`.",
        "fix": "if [ -f /etc/hosts ]"
      },
      {
        "bad": "echo $? doosri line par chalana",
        "err": "prints 0 from previous echo, not original command",
        "why": "`$?` har nayi command ke sath foran overwrite ho jata hai. Agar original command ka exit code rakhna ho toh turant variable mein store karo (`STATUS=$?`).",
        "fix": "STATUS=$?"
      }
    ],
    "intro": "ट्रैफ़िक सिग्नल सोचो। हर कमांड चलने के बाद एक हिडन पर्ची छोड़ती है जिसका नाम है डॉलर क्वेश्चन-मार्क, यानी एग्ज़िट कोड। अगर पर्ची पर ज़ीरो लिखा है बराबर ग्रीन लाइट यानी सक्सेस। अगर वन या वन ट्वेंटी-सेवन लिखा है बराबर रेड लाइट यानी एरर। इफ़-एल्स इस पर्ची को देख कर फ़ैसला लेता है: अगर बैकअप पास हुआ तो ईमेल भेजो, अगर फ़ेल हुआ तो सायरन बजाओ।"
  },
  {
    "id": "lx-bash-2",
    "course": "linux",
    "sec": "Package Management aur Automation",
    "title": "Production Bash Script: Loops, functions aur health checks",
    "url": "https://google.github.io/styleguide/shellguide.html",
    "meta": "Linux · prod-db01 · bash",
    "summary": "Real-world production grade bash automation: `for` loops, `while read` line by line processing, modular functions, color logging (`log_info`, `log_error`), argument parsing (`$1, $2, $#`), aur complete server audit checklist script.",
    "simple": "Junior script 5 commands ek ke baad ek likhta hai. Senior production script ek organized factory jaisi hoti hai: har kaam ka ek function hota hai (`check_disk`, `check_db`), saare servers par loop ghoomta hai (`for host in ...`), aur clean timestamped colored logs bante hain taaki raat 3 baje on-call engineer ko padhte hi issue samajh aaye.",
    "words": [
      [
        "for loop",
        "List of items (servers, files, IPs) par bari-bari command chalana."
      ],
      [
        "while read line",
        "Text file ko line-by-line safe tarike se iterate karna."
      ],
      [
        "Functions",
        "Reusable code blocks jaise `log_ok()`, `backup_schema()`."
      ],
      [
        "$1, $2, $@",
        "Script ko pass kiye gaye arguments ($1 pehla, $2 doosra, $@ saare)."
      ],
      [
        "$#",
        "Arguments ka total count."
      ],
      [
        "$(date +%F_%T)",
        "Current timestamp format karna."
      ],
      [
        "trap",
        "Script achanak terminate hone par cleanup code chalana."
      ]
    ],
    "nodes": [
      [
        "script",
        "doc",
        24,
        38,
        190,
        86,
        "scripts/backup_db.sh",
        {
          "sub": "#!/bin/bash + set -e",
          "tone": "file"
        }
      ],
      [
        "loop",
        "proc",
        244,
        52,
        210,
        58,
        "for / while Loop",
        {
          "sub": "Iterates services & lines",
          "tone": "accent"
        }
      ],
      [
        "stbl",
        "table",
        484,
        36,
        452,
        150,
        "Script Execution Audit Log",
        {
          "cols": [
            "TARGET",
            "CONSTRUCT",
            "STATUS"
          ],
          "cw": [
            0.34,
            0.28,
            0.38
          ]
        }
      ],
      [
        "term",
        "term",
        24,
        206,
        912,
        304,
        "Terminal · Modular Bash Automation"
      ]
    ],
    "code": [
      "# 1. Loop through list of critical production services",
      "for srv in nginx sshd; do systemctl is-active --quiet $srv && echo \"[OK] $srv active\" || echo \"[FAIL] $srv down\"; done",
      "# 2. View complete production database backup script",
      "cat scripts/backup_db.sh",
      "# 3. Execute backup script and inspect generated timestamped output",
      "./scripts/backup_db.sh",
      "# 4. Read file line by line using while read loop",
      "while read line; do echo \"Task: $line\"; done < todo.txt | head -n 3"
    ],
    "codeTitle": "Bash · prod-db01",
    "steps": [
      {
        "say": "Production mein repetitive tasks ke liye loop aur modular functions use kiye jaate hain taaki code clean aur maintainable rahe.",
        "ops": [
          [
            "show",
            "script",
            "loop",
            "stbl",
            "term"
          ],
          [
            "link",
            "script",
            "loop",
            {
              "tone": "file"
            }
          ],
          [
            "link",
            "loop",
            "stbl",
            {
              "tone": "accent"
            }
          ]
        ],
        "vo": "प्रोडक्शन में रिपिटिटिव टास्क्स के लिए लूप और मॉड्यूलर फ़ंक्शन्स यूज़ किए जाते हैं ताकि कोड क्लीन और मेंटेनेबल रहे।"
      },
      {
        "say": "Services check karne ke liye ek line ka for loop: `for srv in nginx sshd; do ... done`. Dono services ka health status ek second mein samne aa gaya.",
        "code": [
          0,
          1
        ],
        "ops": [
          [
            "label",
            "loop",
            "for srv in nginx sshd",
            "Service health loop"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ for srv in nginx sshd; do systemctl is-active --quiet $srv && echo \"[OK] $srv active\" || echo \"[FAIL] $srv down\"; done"
          ],
          [
            "flow",
            "loop",
            "stbl",
            "check nginx, sshd",
            {
              "tone": "ok",
              "dur": 550
            }
          ],
          [
            "addrow",
            "stbl",
            [
              "nginx.service",
              "for-loop",
              "[OK] nginx active"
            ],
            {
              "tone": "ok"
            }
          ],
          [
            "addrow",
            "stbl",
            [
              "sshd.service",
              "for-loop",
              "[OK] sshd active"
            ],
            {
              "tone": "ok"
            }
          ],
          [
            "out",
            "term",
            "[OK] nginx active",
            "[OK] sshd active"
          ]
        ],
        "vo": "सर्विसेज़ चेक करने के लिए एक लाइन का फ़ॉर लूप: फ़ॉर एस-आर-वी इन इंजन-एक्स एस-एस-एच-डी डू डन। दोनों सर्विसेज़ का हेल्थ स्टेटस एक सेकंड में सामने आ गया।"
      },
      {
        "say": "`scripts/backup_db.sh` inspect karo. Dekho kaise timestamp variable `$(date +%Y%m%d_%H%M%S)` aur logging functions banaye gaye hain.",
        "code": [
          2,
          3
        ],
        "ops": [
          [
            "pulse",
            "script"
          ],
          [
            "ok",
            "script"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ cat scripts/backup_db.sh"
          ],
          [
            "out",
            "term",
            "#!/bin/bash",
            "set -e",
            "TIMESTAMP=$(date +%Y%m%d_%H%M%S)",
            "BACKUP_DIR=\"/var/log/oracle\"",
            "echo \"=== [START] Database Backup at $TIMESTAMP ===\"",
            "echo \"Exporting schemas and validating tablespace free space...\"",
            "echo \"=== [DONE] Backup finished successfully ===\""
          ]
        ],
        "vo": "स्क्रिप्ट्स स्लैश बैकअप डी-बी डॉट एस-एच इंस्पेक्ट करो। देखो कैसे टाइमस्टैम्प वेरिएबल और लॉगिंग फ़ंक्शन्स बनाए गए हैं।"
      },
      {
        "say": "Script run karo: `./scripts/backup_db.sh`. Output clean aur audited aayega.",
        "code": [
          4,
          5
        ],
        "ops": [
          [
            "term",
            "term",
            "oracle@prod-db01:~$ ./scripts/backup_db.sh"
          ],
          [
            "flow",
            "script",
            "stbl",
            "run backup_db.sh",
            {
              "tone": "ok",
              "dur": 550
            }
          ],
          [
            "addrow",
            "stbl",
            [
              "backup_db.sh",
              "set -e script",
              "[DONE] 20261029_110000"
            ],
            {
              "tone": "ok"
            }
          ],
          [
            "out",
            "term",
            "=== [START] Database Backup at 20261029_110000 ===",
            "Exporting schemas and validating tablespace free space...",
            "=== [DONE] Backup finished successfully ==="
          ]
        ],
        "vo": "स्क्रिप्ट रन करो: डॉट स्लैश स्क्रिप्ट्स स्लैश बैकअप डी-बी डॉट एस-एच। आउटपुट क्लीन और ऑडिटेड आएगा।"
      },
      {
        "say": "Files ko line-by-line iterate karne ke liye `while read line; do ... done < file.txt` sabse safe tareeqa hai (spaces aur special characters break nahi hote).",
        "code": [
          6,
          7
        ],
        "ops": [
          [
            "label",
            "loop",
            "while read line < todo.txt",
            "Line-by-line file reader"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ while read line; do echo \"Task: $line\"; done < todo.txt | head -n 3"
          ],
          [
            "addrow",
            "stbl",
            [
              "todo.txt (3 lines)",
              "while read",
              "Tasks processed"
            ],
            {
              "tone": "accent"
            }
          ],
          [
            "out",
            "term",
            "Task: backup database",
            "Task: check disk",
            "Task: rotate logs"
          ],
          [
            "ok",
            "loop"
          ]
        ],
        "vo": "फ़ाइल्स को लाइन-बाय-लाइन इटरेट करने के लिए वाइल रीड लाइन डू डन लेस-दैन फ़ाइल डॉट टी-एक्स-टी सबसे सेफ़ तरीक़ा है, इससे स्पेसेज़ और स्पेशल कैरेक्टर्स ब्रेक नहीं होते।"
      }
    ],
    "points": [
      "`set -e` at start = script stops immediately on any unexpected command failure.",
      "`for item in list; do ... done` = iterate across items.",
      "`while read line; do ... done < file` = safe line-by-line file reader.",
      "Functions make scripts testable: `function check_disk() { ... }`.",
      "Always quote variables: `\"$VAR\"` prevents word-splitting and globbing bugs."
    ],
    "check": {
      "q": "Production bash script ke shuru mein `set -e` lagana kyu mandatory Google/enterprise standard mana jata hai?",
      "a": [
        "Script ko fast chalane ke liye.",
        "Taaki agar script ke beech mein koi command fail ho, toh script wahin ruk jaye aur aage ki dangerous commands (jaise clean up ya data overwrite) na chal sakein.",
        "Color output dene ke liye.",
        "Sudo password bypass karne ke liye."
      ],
      "c": 1,
      "why": "Default bash mein agar line 5 fail ho jaye, toh bash rukta nahi balki line 6, 7 chalata rehta hai. `set -e` (errexit) kisi bhi command ke fail hone par script ko foran exit kar deta hai."
    },
    "syntax": {
      "code": "#!/bin/bash\nset -euo pipefail\n\nlog() {\n  echo \"[$(date +'%Y-%m-%d %H:%M:%S')] $1\"\n}\n\nfor host in \"db01\" \"db02\"; do\n  log \"Checking $host...\"\ndone",
      "parts": [
        [
          "set -e",
          "Exit on error."
        ],
        [
          "set -u",
          "Exit on unset variables."
        ],
        [
          "set -o pipefail",
          "Pipelines fail if any command fails, not just the last one."
        ],
        [
          "log()",
          "Reusable function."
        ]
      ]
    },
    "scenario": "Nightly archivelog backup script mein `tar` command fail ho gayi thi disk full hone ki wajah se. Par script ne bina `set -e` ke agli command `rm -rf /archivelogs/*` chala di! Backup bana nahi aur purane logs delete ho gaye. Post-mortem ke baad company ne har script mein `set -euo pipefail` mandatory kiya.",
    "tasks": [
      {
        "t": "For loop se `nginx` aur `sshd` dono services ka active status check karo.",
        "sql": "for srv in nginx sshd; do systemctl is-active --quiet $srv && echo \"$srv OK\" || echo \"$srv FAIL\"; done"
      },
      {
        "t": "`scripts/backup_db.sh` inspect karo aur execute karo (`./scripts/backup_db.sh`).",
        "sql": "cat scripts/backup_db.sh\n./scripts/backup_db.sh"
      },
      {
        "t": "`todo.txt` ko `while read line` loop se iterate karke pehli 2 lines print karo.",
        "sql": "while read line; do echo \"TODO: $line\"; done < todo.txt | head -n 2"
      }
    ],
    "mistakes": [
      {
        "bad": "for line in $(cat file.txt) (to read lines)",
        "err": "broken on spaces: each word became separate loop iteration",
        "why": "`$(cat file.txt)` words par split karta hai. Spaces wali lines ko sahi se padhne ke liye hamesha `while IFS= read -r line; do ... done < file.txt` use karo.",
        "fix": "while read line; do echo \"$line\"; done < file.txt"
      },
      {
        "bad": "rm -rf $DIR/ (jab $DIR set na ho)",
        "err": "ran rm -rf / and wiped root filesystem!",
        "why": "Agar `$DIR` variable khaali ho, toh `rm -rf $DIR/` command `rm -rf /` ban jaati hai! Isliye shuru mein `set -u` lagao taaki unassigned variable par script ruk jaye.",
        "fix": "set -u && rm -rf \"${DIR:?}/\""
      }
    ],
    "intro": "जूनियर स्क्रिप्ट पाँच कमांड्स एक के बाद एक लिखता है। सीनियर प्रोडक्शन स्क्रिप्ट एक ऑर्गनाइज़्ड फ़ैक्ट्री जैसी होती है: हर काम का एक फ़ंक्शन होता है जैसे चेक डिस्क और चेक डी-बी, सारे सर्वर्स पर लूप घूमता है, और क्लीन टाइमस्टैम्प्ड लॉग्स बनते हैं ताकि रात तीन बजे ऑन-कॉल इंजीनियर को पढ़ते ही इश्यू समझ आए।"
  },
  {
    "id": "lx-limits-sysctl",
    "course": "linux",
    "sec": "Enterprise Hardening aur Production Incidents",
    "title": "Kernel Tuning: limits.conf, sysctl aur ulimit",
    "url": "https://man7.org/linux/man-pages/man5/limits.conf.5.html",
    "meta": "Linux · prod-db01 · bash",
    "summary": "Enterprise database aur high-traffic server ke kernel parameters: `ulimit -n` (open file descriptors), `/etc/security/limits.conf` (nofile, nproc for oracle user), `/etc/sysctl.conf` (kernel shared memory `shmmax`, swap aggression `vm.swappiness`, networking `net.core.somaxconn`), aur `sysctl -p`.",
    "simple": "Highway par speed limit aur flyover ki weight limit socho. Default Linux ek normal laptop ke hisab se set hota hai: max 1024 open files. Par Oracle Database ya Nginx ko ek second mein 65,000 files aur network sockets open karne hote hain! Agar limit na badhao, toh `Too many open files` crash aa jata hai. `limits.conf` aur `sysctl` Linux ke engine ko race car banate hain.",
    "words": [
      [
        "ulimit -n",
        "Current session ki maximum open files (file descriptors) limit."
      ],
      [
        "ulimit -u",
        "Current user ki maximum running processes (nproc) limit."
      ],
      [
        "/etc/security/limits.conf",
        "User-level limits (nofile, nproc, memlock, stack) ki master configuration."
      ],
      [
        "sysctl",
        "Running Linux kernel parameters inspect aur modify karne ka tool."
      ],
      [
        "/etc/sysctl.conf",
        "Permanent kernel parameters file jo boot par load hoti hai."
      ],
      [
        "vm.swappiness",
        "Kernel kitni jaldi RAM se data nikaal kar swap mein bhejta hai (DB ke liye 1 ya 10 recommend hota hai, default 60 hota hai)."
      ],
      [
        "sysctl -p",
        "Bina server reboot kiye `/etc/sysctl.conf` ke changes apply karna."
      ]
    ],
    "nodes": [
      [
        "ora",
        "user",
        34,
        48,
        62,
        54,
        "oracle",
        {
          "sub": "DBA Account",
          "tone": "accent"
        }
      ],
      [
        "limits",
        "doc",
        140,
        38,
        210,
        78,
        "/etc/security/limits.conf",
        {
          "sub": "nofile 65536 · nproc 16384",
          "tone": "file"
        }
      ],
      [
        "sysctl",
        "doc",
        380,
        38,
        210,
        78,
        "/etc/sysctl.conf",
        {
          "sub": "shmmax · swappiness = 10",
          "tone": "proc"
        }
      ],
      [
        "vnofile",
        "var",
        625,
        34,
        148,
        50,
        "ulimit -n (nofile)",
        {
          "v": "65536",
          "tone": "ok"
        }
      ],
      [
        "vnproc",
        "var",
        788,
        34,
        148,
        50,
        "ulimit -u (nproc)",
        {
          "v": "16384",
          "tone": "ok"
        }
      ],
      [
        "vswap",
        "var",
        625,
        102,
        148,
        50,
        "vm.swappiness",
        {
          "v": "10 (Tuned)",
          "tone": "accent"
        }
      ],
      [
        "engine",
        "proc",
        788,
        102,
        148,
        50,
        "sysctl -p",
        {
          "sub": "Live Kernel Apply",
          "tone": "ok"
        }
      ],
      [
        "term",
        "term",
        24,
        190,
        912,
        320,
        "Terminal · Kernel & Limits Tuning"
      ]
    ],
    "code": [
      "# 1. Inspect current open file limit for current session",
      "ulimit -n",
      "# 2. Inspect maximum process limit (nproc)",
      "ulimit -u",
      "# 3. View user security limits configuration (/etc/security/limits.conf)",
      "cat /etc/security/limits.conf",
      "# 4. Inspect current kernel swappiness value",
      "cat /proc/sys/vm/swappiness",
      "# 5. View persistent kernel parameters and reload with sysctl -p",
      "cat /etc/sysctl.conf",
      "sudo sysctl -p"
    ],
    "codeTitle": "Bash · prod-db01",
    "steps": [
      {
        "say": "Oracle Database install karne se pehle official installation guide bolti hai: \"Configure kernel limits and sysctl\". Bina iske production crash ho jayegi.",
        "ops": [
          [
            "show",
            "ora",
            "limits",
            "sysctl",
            "term"
          ],
          [
            "link",
            "ora",
            "limits",
            {
              "tone": "accent"
            }
          ],
          [
            "link",
            "limits",
            "sysctl",
            {
              "tone": "proc"
            }
          ]
        ],
        "vo": "ओरेकल डेटाबेस इंस्टॉल करने से पहले ऑफ़िशियल इंस्टॉलेशन गाइड बोलती है: कॉन्फ़िगर कर्नल लिमिट्स एंड सिस-सी-टी-एल। बिना इसके प्रोडक्शन क्रैश हो जाएगी।"
      },
      {
        "say": "Open files limit check karo: `ulimit -n`. Production Oracle server par yeh 65536 ya 1048576 honi chahiye.",
        "code": [
          0,
          1,
          2,
          3
        ],
        "ops": [
          [
            "show",
            "vnofile",
            "vnproc"
          ],
          [
            "pulse",
            "vnofile",
            "vnproc"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ ulimit -n"
          ],
          [
            "out",
            "term",
            "65536"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ ulimit -u"
          ],
          [
            "out",
            "term",
            "16384"
          ],
          [
            "ok",
            "ora"
          ]
        ],
        "vo": "ओपन फ़ाइल्स लिमिट चेक करो: यू-लिमिट डैश एन। प्रोडक्शन ओरेकल सर्वर पर ये पैंसठ हज़ार पाँच सौ छत्तीस होनी चाहिए।"
      },
      {
        "say": "`/etc/security/limits.conf` mein `oracle soft nofile 65536` aur `oracle hard nofile 65536` define kiya jata hai taaki login hote hi limits auto-set hon.",
        "code": [
          4,
          5
        ],
        "ops": [
          [
            "flow",
            "limits",
            "vnofile",
            "soft/hard 65536",
            {
              "tone": "file",
              "dur": 550
            }
          ],
          [
            "ok",
            "limits"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ cat /etc/security/limits.conf"
          ],
          [
            "out",
            "term",
            "# Oracle Recommended Limits",
            "oracle   soft   nofile   65536",
            "oracle   hard   nofile   65536",
            "oracle   soft   nproc    16384",
            "oracle   hard   nproc    16384",
            "oracle   soft   stack    10240",
            "oracle   hard   stack    32768"
          ]
        ],
        "vo": "स्लैश ई-टी-सी स्लैश सिक्योरिटी स्लैश लिमिट्स डॉट कॉन्फ़ में ओरेकल सॉफ़्ट नो-फ़ाइल और हार्ड नो-फ़ाइल डिफ़ाइन किया जाता है ताकि लॉगिन होते ही लिमिट्स ऑटो-सेट हों।"
      },
      {
        "say": "Database performance ke liye `vm.swappiness` bohot ahem hai. Default `60` hota hai jisse kernel jaldi swap karne lagta hai. DB ke liye ise `10` ya `1` rakha jata hai.",
        "code": [
          6,
          7
        ],
        "ops": [
          [
            "show",
            "vswap"
          ],
          [
            "val",
            "vswap",
            "10 (Avoid Swap)",
            {
              "tone": "accent"
            }
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ cat /proc/sys/vm/swappiness"
          ],
          [
            "out",
            "term",
            "10"
          ]
        ],
        "vo": "डेटाबेस परफ़ॉर्मेंस के लिए वी-एम डॉट स्वैपिनेस बहुत अहम है। डिफ़ॉल्ट सिक्सटी होता है जिससे कर्नल जल्दी स्वैप करने लगता है। डी-बी के लिए इसे टेन या वन रखा जाता है।"
      },
      {
        "say": "`/etc/sysctl.conf` modify karne ke baad server reboot karne ki zaroorat nahi hoti; `sudo sysctl -p` chalao aur kernel parameters live apply ho jaate hain.",
        "code": [
          8,
          9,
          10
        ],
        "ops": [
          [
            "show",
            "engine"
          ],
          [
            "link",
            "sysctl",
            "engine",
            {
              "tone": "ok"
            }
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ cat /etc/sysctl.conf"
          ],
          [
            "out",
            "term",
            "fs.file-max = 6815744",
            "kernel.sem = 250 32000 100 128",
            "kernel.shmmax = 4398046511104",
            "kernel.shmall = 1073741824",
            "vm.swappiness = 10"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ sudo sysctl -p"
          ],
          [
            "flow",
            "sysctl",
            "engine",
            "apply live",
            {
              "tone": "ok",
              "dur": 550
            }
          ],
          [
            "out",
            "term",
            "fs.file-max = 6815744",
            "kernel.sem = 250 32000 100 128",
            "kernel.shmmax = 4398046511104",
            "kernel.shmall = 1073741824",
            "vm.swappiness = 10"
          ],
          [
            "ok",
            "sysctl"
          ],
          [
            "ok",
            "engine"
          ]
        ],
        "vo": "स्लैश ई-टी-सी स्लैश सिस-सी-टी-एल डॉट कॉन्फ़ मॉडिफ़ाई करने के बाद सर्वर रीबूट करने की ज़रूरत नहीं होती; सूडो सिस-सी-टी-एल डैश पी चलाओ और कर्नल पैरामीटर्स लाइव अप्लाई हो जाते हैं।"
      }
    ],
    "points": [
      "`ulimit -n` = current session open file descriptor limit.",
      "`/etc/security/limits.conf` = user-level permanent limits (nofile, nproc).",
      "`/etc/sysctl.conf` = kernel-level parameters (shared memory, swappiness, networking).",
      "`sudo sysctl -p` = applies `/etc/sysctl.conf` instantly without reboot.",
      "Databases ke liye low swappiness (10) disk thrashing se bachata hai."
    ],
    "check": {
      "q": "Nginx ya Oracle Database high traffic ke time crash ho jati hai aur error aata hai: `java.io.IOException: Too many open files` ya `socket() failed (24: Too many open files)`. Isko permanently fix karne ke liye kaunsi file modify karni hogi?",
      "a": [
        "/etc/hosts",
        "/etc/security/limits.conf (nofile limit badhana)",
        "/etc/fstab",
        "/etc/resolv.conf"
      ],
      "c": 1,
      "why": "Default user limit 1024 open files hoti hai jo high traffic par khatam ho jaati hai. `/etc/security/limits.conf` mein `nofile 65536` karne se yeh issue permanently solve hota hai."
    },
    "syntax": {
      "code": "ulimit -n                        # Check open files limit\nulimit -a                        # Check all limits\ncat /etc/security/limits.conf    # User limits\ncat /etc/sysctl.conf             # Kernel sysctl parameters\nsudo sysctl -p                   # Reload sysctl without reboot\nsysctl vm.swappiness             # Read specific kernel parameter",
      "parts": [
        [
          "nofile",
          "Number of open files."
        ],
        [
          "nproc",
          "Number of processes."
        ],
        [
          "sysctl -p",
          "Loads settings from /etc/sysctl.conf."
        ]
      ]
    },
    "scenario": "Black Friday sale shuru hote hi e-commerce backend down ho gaya. Application logs mein `Too many open files` flood ho raha tha. Engineer ne `ulimit -n` dekha toh 1024 tha. Usne turant limits.conf mein 65536 set kiya, application restart kari aur site bina crash ke 50,000 concurrent customers handle karne lagi.",
    "tasks": [
      {
        "t": "Current user ki open files limit check karo (`ulimit -n`).",
        "sql": "ulimit -n"
      },
      {
        "t": "`/etc/security/limits.conf` mein Oracle ke limits inspect karo.",
        "sql": "cat /etc/security/limits.conf"
      },
      {
        "t": "Kernel parameters `/etc/sysctl.conf` inspect karo aur `sudo sysctl -p` se reload karo.",
        "sql": "cat /etc/sysctl.conf\nsudo sysctl -p"
      }
    ],
    "mistakes": [
      {
        "bad": "ulimit -n 65536 in terminal (aur sochna permanent ho gaya)",
        "err": "reverted back to 1024 on next login",
        "why": "`ulimit` command sirf current terminal session ke liye hoti hai. Permanently badhane ke liye `/etc/security/limits.conf` mein entry karna zaroori hai.",
        "fix": "edit /etc/security/limits.conf"
      },
      {
        "bad": "setting vm.swappiness=0 in production",
        "err": "kernel OOM panic on memory pressure",
        "why": "`0` karne par kernel swap use karne se bilkul inkaar kar deta hai, jisse OOM (Out Of Memory) killer database ko turant kill kar deta hai. Hamesha `1` ya `10` safe value rakho.",
        "fix": "vm.swappiness = 10"
      }
    ],
    "intro": "हाईवे पर स्पीड लिमिट और फ़्लाईओवर की वेट लिमिट सोचो। डिफ़ॉल्ट लिनक्स एक नॉर्मल लैपटॉप के हिसाब से सेट होता है: मैक्स टेन ट्वेंटी-फोर ओपन फ़ाइल्स। पर ओरेकल डेटाबेस या इंजन-एक्स को एक सेकंड में सिक्सटी-फाइव थाउज़ंड फ़ाइल्स और नेटवर्क सॉकेट्स ओपन करने होते हैं! अगर लिमिट न बढ़ाओ, तो टू मेनी ओपन फ़ाइल्स क्रैश आ जाता है। लिमिट्स डॉट कॉन्फ़ और सिस-सी-टी-एल लिनक्स के इंजन को रेस कार बनाते हैं।"
  },
  {
    "id": "lx-sec-audit",
    "course": "linux",
    "sec": "Enterprise Hardening aur Production Incidents",
    "title": "Security Hardening: SSH config, CIS benchmarks aur audit",
    "url": "https://www.cisecurity.org/benchmark/ubuntu_linux",
    "meta": "Linux · prod-db01 · bash",
    "summary": "Enterprise server hardening standard (CIS Benchmarks): SSH hardening `/etc/ssh/sshd_config` (`PermitRootLogin no`, `PasswordAuthentication no`), brute force attacks audit `/var/log/auth.log`, fail2ban concept, file integrity, aur sensitive permissions audit.",
    "simple": "Apne ghar ka security lock system upgrade karna socho. 1. Sabse pehla kaam: Direct master key ka hole band karo (`PermitRootLogin no`). 2. Kamzor passwords ban karo, sirf biometric chaabi allow karo (`PasswordAuthentication no`). 3. Darwaze ke CCTV camera ki recording check karo kaun baar-baar lock todne ki koshish kar raha tha (`/var/log/auth.log`).",
    "words": [
      [
        "Hardening",
        "Server ke default settings ko secure karke attacks aur vulnerabilities ko band karna."
      ],
      [
        "CIS Benchmark",
        "Center for Internet Security: Global industry-standard security guidelines."
      ],
      [
        "PermitRootLogin no",
        "Root user se direct remote SSH login block karna."
      ],
      [
        "PasswordAuthentication no",
        "Password login disable karke sirf SSH key authentication allow karna."
      ],
      [
        "/var/log/auth.log",
        "Authentication aur sudo commands ka master security audit trail."
      ],
      [
        "Failed password",
        "Log entry jo brute force password guessing attack dikhati hai."
      ],
      [
        "fail2ban",
        "Automated security service jo 5 failed attempts ke baad attacker IP ko firewall se ban kar deti hai."
      ]
    ],
    "nodes": [
      [
        "sshd",
        "doc",
        24,
        38,
        190,
        74,
        "/etc/ssh/sshd_config",
        {
          "sub": "PermitRootLogin no",
          "tone": "accent"
        }
      ],
      [
        "authlog",
        "doc",
        24,
        124,
        190,
        68,
        "/var/log/auth.log",
        {
          "sub": "SSH & sudo audit trail",
          "tone": "file"
        }
      ],
      [
        "cistbl",
        "table",
        244,
        38,
        510,
        154,
        "CIS Security Compliance Audit Table",
        {
          "cols": [
            "CONTROL",
            "SOURCE",
            "FINDING",
            "VERDICT"
          ],
          "cw": [
            0.26,
            0.22,
            0.34,
            0.18
          ]
        }
      ],
      [
        "safe",
        "box",
        780,
        64,
        156,
        96,
        "CIS Hardened",
        {
          "sub": "prod-db01 Verified",
          "tone": "ok"
        }
      ],
      [
        "term",
        "term",
        24,
        210,
        912,
        300,
        "Terminal · Security Audit & Hardening"
      ]
    ],
    "code": [
      "# 1. Inspect SSH daemon security configuration",
      "grep -E \"^(PermitRootLogin|PasswordAuthentication)\" /etc/ssh/sshd_config",
      "# 2. Inspect authentication log for failed login attempts (brute force hunt)",
      "grep -i \"failed password\" /var/log/auth.log",
      "# 3. Check sudo command audit logs to see who executed what",
      "grep \"COMMAND\" /var/log/auth.log",
      "# 4. Find all files with dangerous 777 permissions in home directory",
      "find /home/oracle -type f -perm 0777"
    ],
    "codeTitle": "Bash · prod-db01",
    "steps": [
      {
        "say": "Production audit ke dauran security compliance team aati hai. Unka pehla check: SSH configuration aur login audit logs.",
        "ops": [
          [
            "show",
            "sshd",
            "authlog",
            "cistbl",
            "safe",
            "term"
          ],
          [
            "link",
            "sshd",
            "cistbl",
            {
              "tone": "accent"
            }
          ],
          [
            "link",
            "authlog",
            "cistbl",
            {
              "tone": "file"
            }
          ],
          [
            "link",
            "cistbl",
            "safe",
            {
              "tone": "ok"
            }
          ]
        ],
        "vo": "प्रोडक्शन ऑडिट के दौरान सिक्योरिटी कंप्लायंस टीम आती है। उनका पहला चेक: एस-एस-एच कॉन्फ़िगरेशन और लॉगिन ऑडिट लॉग्स।"
      },
      {
        "say": "SSH settings inspect karo: `PermitRootLogin no` aur `PasswordAuthentication no` enterprise CIS benchmark rule #1 hai.",
        "code": [
          0,
          1
        ],
        "ops": [
          [
            "term",
            "term",
            "oracle@prod-db01:~$ grep -E \"^(PermitRootLogin|PasswordAuthentication)\" /etc/ssh/sshd_config"
          ],
          [
            "flow",
            "sshd",
            "cistbl",
            "SSH policy",
            {
              "tone": "ok",
              "dur": 500
            }
          ],
          [
            "addrow",
            "cistbl",
            [
              "SSH Root & Passwd",
              "sshd_config",
              "Both set to \"no\"",
              "PASS"
            ],
            {
              "tone": "ok"
            }
          ],
          [
            "out",
            "term",
            "PermitRootLogin no",
            "PasswordAuthentication no"
          ],
          [
            "ok",
            "sshd"
          ]
        ],
        "vo": "एस-एस-एच सेटिंग्स इंस्पेक्ट करो: परमिट रूट लॉगिन नो और पासवर्ड ऑथेंटिकेशन नो एंटरप्राइज सी-आई-एस बेंचमार्क रूल नंबर वन है।"
      },
      {
        "say": "Security Audit: `/var/log/auth.log` mein search karo `Failed password`. Agar ek hi IP se 500 lines aayi hain, matlab hacker brute-force dictionary attack kar raha hai!",
        "code": [
          2,
          3
        ],
        "ops": [
          [
            "term",
            "term",
            "oracle@prod-db01:~$ grep -i \"failed password\" /var/log/auth.log"
          ],
          [
            "flow",
            "authlog",
            "cistbl",
            "brute-force",
            {
              "tone": "danger",
              "dur": 500
            }
          ],
          [
            "addrow",
            "cistbl",
            [
              "Brute-Force Log",
              "auth.log",
              "203.0.113.9 (2 fails)",
              "DETECTED"
            ],
            {
              "tone": "danger"
            }
          ],
          [
            "out",
            "term",
            "Oct 29 09:12:00 prod-db01 sshd[901]: Failed password for invalid user admin from 203.0.113.9 port 44120 ssh2",
            "Oct 29 09:12:02 prod-db01 sshd[904]: Failed password for invalid user test from 203.0.113.9 port 44122 ssh2"
          ]
        ],
        "vo": "सिक्योरिटी ऑडिट: स्लैश वार स्लैश लॉग स्लैश ऑथ डॉट लॉग में सर्च करो फ़ेल्ड पासवर्ड। अगर एक ही आई-पी से पाँच सौ लाइन्स आई हैं, मतलब हैकर ब्रूट-फ़ोर्स डिक्शनरी अटैक कर रहा है!"
      },
      {
        "say": "Sudo Accountability: `grep \"COMMAND\" /var/log/auth.log` se har sudo action ka user aur exact command milta hai (kisi ne chori se file delete toh nahi ki).",
        "code": [
          4,
          5
        ],
        "ops": [
          [
            "term",
            "term",
            "oracle@prod-db01:~$ grep \"COMMAND\" /var/log/auth.log"
          ],
          [
            "addrow",
            "cistbl",
            [
              "Sudo Accountability",
              "auth.log",
              "nginx + ufw logged",
              "PASS"
            ],
            {
              "tone": "accent"
            }
          ],
          [
            "out",
            "term",
            "Oct 29 08:30:15 prod-db01 sudo:   oracle : TTY=pts/0 ; PWD=/home/oracle ; USER=root ; COMMAND=/bin/systemctl restart nginx",
            "Oct 29 09:45:00 prod-db01 sudo:   oracle : TTY=pts/0 ; PWD=/home/oracle ; USER=root ; COMMAND=/usr/sbin/ufw status"
          ]
        ],
        "vo": "सूडो अकाउंटेबिलिटी: ग्रेप कमांड स्लैश वार स्लैश लॉग स्लैश ऑथ डॉट लॉग से हर सूडो एक्शन का यूज़र और एग्ज़ैक्ट कमांड मिलता है।"
      },
      {
        "say": "Permission Audit: Kabhi bhi production par `777` permissions nahi honi chahiye. `find /home -type f -perm 0777` se open vulnerable files pakdo.",
        "code": [
          6,
          7
        ],
        "ops": [
          [
            "term",
            "term",
            "oracle@prod-db01:~$ find /home/oracle -type f -perm 0777"
          ],
          [
            "addrow",
            "cistbl",
            [
              "0777 File Scan",
              "/home/oracle",
              "0 world-writable files",
              "PASS"
            ],
            {
              "tone": "ok"
            }
          ],
          [
            "out",
            "term",
            "# No dangerous 777 files found - Clean!"
          ],
          [
            "ok",
            "authlog"
          ],
          [
            "ok",
            "safe"
          ]
        ],
        "vo": "परमिशन ऑडिट: कभी भी प्रोडक्शन पर सेवन-सेवन-सेवन परमिशन्स नहीं होनी चाहिए। फ़ाइंड स्लैश होम डैश टाइप एफ़ डैश पर्म ज़ीरो सेवन-सेवन-सेवन से ओपन वल्नरेबल फ़ाइल्स पकड़ो।"
      }
    ],
    "points": [
      "Always disable root SSH login (`PermitRootLogin no`).",
      "Always disable password authentication (`PasswordAuthentication no`) in favor of keys.",
      "`/var/log/auth.log` (Ubuntu) ya `/var/log/secure` (RHEL) security investigation ka master log hai.",
      "Regularly audit sudo usage and scan for accidental 777 permissions."
    ],
    "check": {
      "q": "Security auditor server par aakar bolta hai: \"Mujhe pichhle hafte kis engineer ne kaunsi sudo command chalayi thi uski verified report chahiye\". Tum kaunsi file se audit trail nikaal kar doge?",
      "a": [
        "/var/log/nginx/access.log",
        "/var/log/auth.log (ya /var/log/secure)",
        "/etc/passwd",
        "/tmp/todo.txt"
      ],
      "c": 1,
      "why": "Linux par har sudo execution ka record `/var/log/auth.log` (Debian/Ubuntu) ya `/var/log/secure` (RHEL/CentOS) mein timestamp, username aur command ke sath securely write hota hai."
    },
    "syntax": {
      "code": "# SSH Hardening (/etc/ssh/sshd_config):\nPermitRootLogin no\nPasswordAuthentication no\nX11Forwarding no\nMaxAuthTries 3\n\n# Audit commands:\ngrep -i \"failed\" /var/log/auth.log\ngrep \"sudo:\" /var/log/auth.log\nfind / -type f -perm 0777 2>/dev/null",
      "parts": [
        [
          "PermitRootLogin no",
          "Disallows direct root access over network."
        ],
        [
          "auth.log",
          "Tracks authentication successes, failures, and sudo invocations."
        ],
        [
          "MaxAuthTries",
          "Disconnects after N failed attempts to slow down brute force."
        ]
      ]
    },
    "scenario": "SOC (Security Operations Center) ne alert raise kiya ki cloud server par foreign IP se 10,000 SSH login attempts hue. Hardened configuration hone ki wajah se passwords disabled the aur keys mandatory thi, isliye attacker ek baar bhi login nahi kar saka. Team ne IP ko firewall se block karke incident close kiya.",
    "tasks": [
      {
        "t": "SSH security configuration mein `PermitRootLogin` check karo (`grep -E ... /etc/ssh/sshd_config`).",
        "sql": "grep -E \"^(PermitRootLogin|PasswordAuthentication)\" /etc/ssh/sshd_config"
      },
      {
        "t": "`/var/log/auth.log` se failed login attempts search karo (`grep -i \"failed password\"`).",
        "sql": "grep -i \"failed password\" /var/log/auth.log"
      },
      {
        "t": "`/var/log/auth.log` se sudo commands execution history audit karo (`grep \"COMMAND\"`).",
        "sql": "grep \"COMMAND\" /var/log/auth.log"
      }
    ],
    "mistakes": [
      {
        "bad": "sshd_config change karke bina verify kare restart karna",
        "err": "syntax error locked everyone out of remote server",
        "why": "SSH daemon restart karne se pehle `sudo sshd -t` chalana chahiye jo config ka syntax test karta hai. Agar syntax error ho toh restart ruk jata hai.",
        "fix": "sudo sshd -t && sudo systemctl restart sshd"
      },
      {
        "bad": "chmod 777 /var/log/auth.log",
        "err": "audit log tampering vulnerability",
        "why": "Audit logs sirf root readable hone chahiye taaki koi hacker aakar apne footprints delete na kar sake.",
        "fix": "chmod 640 /var/log/auth.log"
      }
    ],
    "intro": "अपने घर का सिक्योरिटी लॉक सिस्टम अपग्रेड करना सोचो। पहला काम: डायरेक्ट मास्टर की का होल बंद करो, यानी परमिट रूट लॉगिन नो। दूसरा: कमज़ोर पासवर्ड्स बैन करो, सिर्फ़ बायोमेट्रिक चाबी अलाउ करो, यानी पासवर्ड ऑथेंटिकेशन नो। तीसरा: दरवाज़े के सी-सी-टी-वी कैमरे की रिकॉर्डिंग चेक करो कौन बार-बार लॉक तोड़ने की कोशिश कर रहा था, यानी स्लैश वार स्लैश लॉग स्लैश ऑथ डॉट लॉग।"
  },
  {
    "id": "lx-incident",
    "course": "linux",
    "sec": "Enterprise Hardening aur Production Incidents",
    "title": "P1 Incident Drill: Production Down Master Runbook",
    "url": "https://sre.google/sre-book/incident-management/",
    "meta": "Linux · prod-db01 · bash",
    "summary": "Production Down P1 Incident Master Simulation: 1. Uptime & Load check -> 2. Disk space check (`df -h`) -> 3. Service status check (`systemctl status payapi`) -> 4. Root cause log analysis (`journalctl -u payapi -n 5`) -> 5. Recover service & verify HTTP 200 healthcheck.",
    "simple": "Poore course ka Grand Finale! Imagine karo shaam ke 7:00 baje hain aur production alert baji: \"Critical - Payment Gateway Down, customers cannot checkout!\". Tum screen par baith kar Step-by-Step Production SRE Runbook execute karte ho aur server ko 3 minute mein zinda kar dete ho!",
    "words": [
      [
        "P1 Incident",
        "Priority 1: Customer-facing critical business downtime."
      ],
      [
        "SRE Runbook",
        "Pre-defined step-by-step troubleshooting checklist."
      ],
      [
        "Triage Order",
        "System Load -> Disk Space -> Services Status -> Logs -> Fix -> Verification."
      ],
      [
        "Root Cause Analysis (RCA)",
        "Incident fix hone ke baad report banana ki problem kyun aayi aur aage kaise bachen."
      ],
      [
        "MTTR",
        "Mean Time To Recovery: Incident shuru hone se fix hone tak ka total waqt."
      ]
    ],
    "nodes": [
      [
        "runbook",
        "stages",
        24,
        32,
        912,
        34,
        "SRE P1 INCIDENT RESPONSE RUNBOOK",
        {
          "items": [
            "1. Alert 502",
            "2. Triage Host",
            "3. Inspect Logs",
            "4. Restart Svc",
            "5. Verify 200 OK"
          ],
          "tone": "danger",
          "at": 0
        }
      ],
      [
        "p1",
        "proc",
        24,
        92,
        195,
        68,
        "P1: PayAPI 502",
        {
          "sub": "Checkout failing!",
          "tone": "danger"
        }
      ],
      [
        "triage",
        "box",
        255,
        92,
        200,
        68,
        "Host Triage",
        {
          "sub": "Load 0.28 · Disk OK",
          "tone": "proc"
        }
      ],
      [
        "invest",
        "box",
        490,
        92,
        205,
        68,
        "payapi.service",
        {
          "sub": "FAILED (DB Refused)",
          "tone": "danger"
        }
      ],
      [
        "fix",
        "box",
        730,
        92,
        206,
        68,
        "Endpoint :8080/health",
        {
          "sub": "Waiting for recovery...",
          "tone": "muted"
        }
      ],
      [
        "term",
        "term",
        24,
        186,
        912,
        324,
        "Terminal · P1 Incident Command Center"
      ]
    ],
    "code": [
      "# Step 1: Check System Health and Load Average",
      "uptime",
      "# Step 2: Check Disk Space across all partitions",
      "df -h",
      "# Step 3: Check failed service status and recent journal logs",
      "systemctl status payapi",
      "journalctl -u payapi -n 5",
      "# Step 4: Restart recovered service",
      "sudo systemctl start payapi",
      "# Step 5: Verify service is listening and health check returns HTTP 200",
      "ss -tulpn | grep 8080",
      "curl -s http://localhost:8080/health"
    ],
    "codeTitle": "Bash · prod-db01",
    "steps": [
      {
        "say": "ALERT! PagerDuty: \"CRITICAL: PayAPI endpoint is failing with 502 Bad Gateway\". As Lead Linux / DevOps Engineer, tum runbook execute karte ho.",
        "ops": [
          [
            "show",
            "runbook",
            "p1",
            "triage",
            "invest",
            "fix",
            "term"
          ],
          [
            "at",
            "runbook",
            0
          ],
          [
            "x",
            "p1"
          ],
          [
            "x",
            "invest"
          ],
          [
            "link",
            "p1",
            "triage",
            {
              "tone": "danger"
            }
          ],
          [
            "link",
            "triage",
            "invest",
            {
              "tone": "proc"
            }
          ],
          [
            "link",
            "invest",
            "fix",
            {
              "tone": "ok"
            }
          ]
        ],
        "vo": "अलर्ट! पेजर-ड्यूटी: क्रिटिकल, पे-ए-पी-आई एंडपॉइंट इज़ फ़ेलिंग विद फाइव ओ टू बैड गेटवे। ऐज़ लीड लिनक्स एंड डेव-ऑप्स इंजीनियर, तुम रनबुक एग्ज़ीक्यूट करते हो।"
      },
      {
        "say": "Step 1 & 2: Pehle server ka load aur disk space check karo. Load 0.28 normal hai, disk par space available hai.",
        "code": [
          0,
          1,
          2,
          3
        ],
        "ops": [
          [
            "at",
            "runbook",
            1
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ uptime"
          ],
          [
            "out",
            "term",
            " 11:15:02 up 14 days,  2 users,  load average: 0.28, 0.42, 0.35"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ df -h"
          ],
          [
            "out",
            "term",
            "Filesystem      Size  Used Avail Use% Mounted on",
            "/dev/sda2        50G   14G   34G  30% /",
            "/dev/sda3        20G   17G  2.1G  89% /var/log",
            "/dev/sdb1       200G   92G   98G  49% /u01"
          ],
          [
            "ok",
            "triage"
          ]
        ],
        "vo": "स्टेप वन एंड टू: पहले सर्वर का लोड और डिस्क स्पेस चेक करो। लोड ज़ीरो पॉइंट ट्वेंटी-एट नॉर्मल है, डिस्क पर स्पेस अवेलेबल है।"
      },
      {
        "say": "Step 3: Service status dekho: `systemctl status payapi`! Yeh `failed` state mein hai. Foran `journalctl -u payapi -n 5` se error pakdo.",
        "code": [
          4,
          5,
          6,
          7
        ],
        "ops": [
          [
            "at",
            "runbook",
            2
          ],
          [
            "flow",
            "triage",
            "invest",
            "check service",
            {
              "tone": "danger",
              "dur": 500
            }
          ],
          [
            "pulse",
            "invest"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ systemctl status payapi"
          ],
          [
            "out",
            "term",
            "● payapi.service - Payment Gateway REST API Microservice",
            "     Active: failed (Result: exit-code)",
            "    Process: 1420 ExecStart=/usr/bin/java -jar /opt/payapi.jar (code=exited, status=1/FAILURE)"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ journalctl -u payapi -n 5"
          ],
          [
            "out",
            "term",
            "Oct 29 09:20:14 prod-db01 payapi[1420]: ERROR SqlExceptionHelper - Connection refused",
            "Oct 29 09:20:14 prod-db01 payapi[1420]: Application failed to start: Database cluster unreachable",
            "Oct 29 09:20:14 prod-db01 systemd[1]: payapi.service: Failed with result 'exit-code'."
          ]
        ],
        "vo": "स्टेप थ्री: सर्विस स्टेटस देखो, सिस्टम-सी-टी-एल स्टेटस पे-ए-पी-आई! ये फ़ेल्ड स्टेट में है। फ़ौरन जर्नल-सी-टी-एल डैश यू पे-ए-पी-आई डैश एन फाइव से एरर पकड़ो।"
      },
      {
        "say": "Root Cause mil gaya: Database listener down hua tha jo ab wapas aa chuka hai, par service restart nahi hui thi. Ab service start karo: `sudo systemctl start payapi`.",
        "code": [
          8,
          9
        ],
        "ops": [
          [
            "at",
            "runbook",
            3
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ sudo systemctl start payapi"
          ],
          [
            "unx",
            "invest"
          ],
          [
            "tone",
            "invest",
            "ok"
          ],
          [
            "label",
            "invest",
            "payapi.service",
            "Active: running (PID 2850)"
          ],
          [
            "ok",
            "invest"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ systemctl status payapi"
          ],
          [
            "out",
            "term",
            "● payapi.service - Payment Gateway REST API Microservice",
            "     Active: active (running) since Wed 2026-10-29 11:15:30 UTC; 5s ago",
            "   Main PID: 2850 (java)"
          ]
        ],
        "vo": "रूट कॉज़ मिल गया: डेटाबेस लिसनर डाउन हुआ था जो अब वापस आ चुका है, पर सर्विस रीस्टार्ट नहीं हुई थी। अब सर्विस स्टार्ट करो: सूडो सिस्टम-सी-टी-एल स्टार्ट पे-ए-पी-आई।"
      },
      {
        "say": "Step 5: Final Verification! Check karo port 8080 listening hai aur health API `{\"status\":\"UP\"}` return kar rahi hai. INCIDENT RESOLVED!",
        "code": [
          10,
          11,
          12,
          13
        ],
        "ops": [
          [
            "at",
            "runbook",
            4
          ],
          [
            "tone",
            "runbook",
            "ok"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ ss -tulpn | grep 8080"
          ],
          [
            "out",
            "term",
            "tcp   LISTEN 0      128          0.0.0.0:8080       0.0.0.0:*     users:((\"java\",pid=2850,fd=14))"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ curl -s http://localhost:8080/health"
          ],
          [
            "flow",
            "invest",
            "fix",
            "LISTEN :8080",
            {
              "tone": "ok",
              "dur": 550
            }
          ],
          [
            "out",
            "term",
            "{\"status\":\"UP\",\"service\":\"payapi\",\"database\":\"connected\",\"timestamp\":\"2026-10-29T11:15:32Z\"}"
          ],
          [
            "tone",
            "fix",
            "ok"
          ],
          [
            "label",
            "fix",
            "Endpoint :8080/health",
            "200 OK · {\"status\":\"UP\"}"
          ],
          [
            "ok",
            "fix"
          ],
          [
            "unx",
            "p1"
          ],
          [
            "tone",
            "p1",
            "ok"
          ],
          [
            "label",
            "p1",
            "P1 RESOLVED",
            "MTTR: 4 mins · All Green"
          ],
          [
            "ok",
            "p1"
          ]
        ],
        "vo": "स्टेप फाइव: फ़ाइनल वेरिफ़िकेशन! चेक करो पोर्ट एटी-एटी लिसनिंग है और हेल्थ ए-पी-आई स्टेटस अप रिटर्न कर रही है। इंसिडेंट रिज़ॉल्व्ड!"
      }
    ],
    "points": [
      "Always follow triage order: System Health -> Storage -> Services -> Logs -> Fix -> Verification.",
      "Never restart blindly without checking journal logs first.",
      "Verification is mandatory: always test port and curl health check before closing incident.",
      "Congratulations! Tumne Linux Zero-to-Expert Master Curriculum complete kar liya hai!"
    ],
    "check": {
      "q": "Production outage ke dauran service restart karne ke foran baad incident call par \"Issue resolved\" bolne se pehle sabse ahem aakhri step kya hota hai?",
      "a": [
        "Server reboot kar dena.",
        "Health endpoint par curl chala kar HTTP 200 status aur customer traffic flow actively verify karna.",
        "Sabhi logs delete kar dena.",
        "Sudo password change kar dena."
      ],
      "c": 1,
      "why": "Service process up dikhne ke bawajood internal errors de sakti hai. Jab tak actual health endpoint (curl) aur logs verify na ho jayein, incident ko resolved declare nahi kiya jata."
    },
    "syntax": {
      "code": "# Master SRE Runbook:\n1. uptime && free -h\n2. df -h\n3. systemctl status <service>\n4. journalctl -u <service> -n 50 --no-pager\n5. sudo systemctl restart <service>\n6. ss -tulpn | grep <port>\n7. curl -I http://localhost:<port>/health",
      "parts": [
        [
          "Triage",
          "Quick health and capacity assessment."
        ],
        [
          "Diagnosis",
          "Logs and systemd status inspection."
        ],
        [
          "Remediation",
          "Service restart or failover."
        ],
        [
          "Verification",
          "Synthetic curl test and port check."
        ]
      ]
    },
    "scenario": "Major bank payment gateway crash ho gaya. On-call engineer ne panic kiye bina standard SRE runbook execute kiya: uptime dekha, disk check kiya, failed payapi service ke journalctl logs se DB reconnect status notice kiya, service restart kari aur curl se verify kiya. Poora P1 incident record 4 minute ke MTTR mein resolve hua!",
    "tasks": [
      {
        "t": "Runbook Step 1 & 2: System uptime aur disk partitions inspect karo (`uptime`, `df -h`).",
        "sql": "uptime\ndf -h"
      },
      {
        "t": "Runbook Step 3: Failed `payapi` service ke logs inspect karo (`journalctl -u payapi -n 5`).",
        "sql": "journalctl -u payapi -n 5"
      },
      {
        "t": "Runbook Step 4 & 5: `payapi` ko start karo aur curl se health check verify karo.",
        "sql": "sudo systemctl start payapi\ncurl -s http://localhost:8080/health"
      }
    ],
    "mistakes": [
      {
        "bad": "Rebooting entire server on first sign of application error",
        "err": "wiped in-memory diagnostic state and caused 15 min downtime",
        "why": "Production server reboot aakhri option hota hai. 95% cases mein sirf specific service restart karne se kaam ho jata hai aur diagnostic logs bache rehte hain.",
        "fix": "systemctl restart <specific_service>"
      },
      {
        "bad": "Closing incident ticket without curl verification",
        "err": "service crashed again 30 seconds later",
        "why": "Hamesha 2-3 minutes wait karke curl healthcheck verify karo taaki crash-looping service pakad mein aa sake.",
        "fix": "curl -s http://localhost:8080/health"
      }
    ],
    "intro": "पूरे कोर्स का ग्रैंड फ़िनाले! इमेजिन करो शाम के सात बजे हैं और प्रोडक्शन अलर्ट बजी: क्रिटिकल, पेमेंट गेटवे डाउन, कस्टमर्स कैननॉट चेकआउट! तुम स्क्रीन पर बैठ कर स्टेप-बाय-स्टेप प्रोडक्शन एस-आर-ई रनबुक एग्ज़ीक्यूट करते हो और सर्वर को तीन मिनट में ज़िंदा कर देते हो!"
  }
];

// Register lessons in global LESSONS array
if (typeof L2 === 'function') {
  LINUX_LESSONS.forEach(l => L2(l));
} else if (typeof LESSONS !== 'undefined') {
  LINUX_LESSONS.forEach(l => { l.v2 = 1; LESSONS.push(l); });
}

// Global browser exposures
if (typeof window !== 'undefined') {
  window.LINUX_SIM = LINUX_SIM;
  window.LINUX_LESSONS = LINUX_LESSONS;
}

// Node.js commonjs export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { LINUX_SIM, lessons: LINUX_LESSONS };
}
