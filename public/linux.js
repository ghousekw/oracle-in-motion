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
        30,
        40,
        260,
        220,
        "Hardware",
        {
          "tone": "file",
          "sub": "CPU · RAM · Disks · NIC"
        }
      ],
      [
        "cpu",
        "box",
        50,
        80,
        100,
        60,
        "CPU",
        {
          "tone": "file"
        }
      ],
      [
        "ram",
        "box",
        170,
        80,
        100,
        60,
        "RAM",
        {
          "tone": "file"
        }
      ],
      [
        "disk",
        "disk",
        110,
        160,
        100,
        80,
        "Storage",
        {
          "tone": "file"
        }
      ],
      [
        "kern",
        "region",
        330,
        40,
        280,
        220,
        "Linux Kernel",
        {
          "tone": "proc",
          "sub": "OS core engine"
        }
      ],
      [
        "sched",
        "pill",
        350,
        90,
        240,
        45,
        "Process Scheduler",
        {
          "tone": "proc"
        }
      ],
      [
        "mem",
        "pill",
        350,
        150,
        240,
        45,
        "Memory Manager",
        {
          "tone": "proc"
        }
      ],
      [
        "drv",
        "pill",
        350,
        210,
        240,
        40,
        "Device Drivers",
        {
          "tone": "proc"
        }
      ],
      [
        "sh",
        "box",
        650,
        60,
        270,
        85,
        "Bash Shell",
        {
          "tone": "accent",
          "sub": "Command interpreter"
        }
      ],
      [
        "user",
        "user",
        740,
        180,
        "Tum / Admin",
        {
          "tone": "mem",
          "sub": "oracle@prod-db01"
        }
      ],
      [
        "term",
        "term",
        30,
        290,
        890,
        220,
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
            "term"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ "
          ]
        ]
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
            "drv",
            "sh"
          ],
          [
            "pulse",
            "kern"
          ]
        ]
      },
      {
        "say": "Jab tum terminal mein `whoami` type karte ho, Shell use samajhta hai aur batata hai ki tum kis user account se logged in ho.",
        "code": [
          0,
          1
        ],
        "ops": [
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
              "tone": "accent"
            }
          ],
          [
            "flow",
            "sh",
            "kern",
            "syscall",
            {
              "tone": "proc"
            }
          ],
          [
            "out",
            "term",
            "oracle"
          ]
        ]
      },
      {
        "say": "`hostname` server ka pehchaan naam dikhata hai, jaise `prod-db01`. Production mein hamesha check karo ki galti se production par kaam toh nahi kar rahe!",
        "code": [
          2,
          3
        ],
        "ops": [
          [
            "term",
            "term",
            "oracle@prod-db01:~$ hostname"
          ],
          [
            "out",
            "term",
            "prod-db01"
          ]
        ]
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
            "term",
            "term",
            "oracle@prod-db01:~$ uname -a"
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
            "out",
            "term",
            " 10:15:22 up 14 days,  3:40,  2 users,  load average: 0.28, 0.42, 0.35"
          ],
          [
            "ok",
            "user"
          ]
        ]
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
    ]
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
        "pill",
        430,
        30,
        100,
        42,
        "/",
        {
          "tone": "accent"
        }
      ],
      [
        "etc",
        "box",
        50,
        120,
        140,
        50,
        "/etc\nconfigs",
        {
          "tone": "file"
        }
      ],
      [
        "var",
        "box",
        210,
        120,
        140,
        50,
        "/var\nlogs & spool",
        {
          "tone": "file"
        }
      ],
      [
        "home",
        "box",
        370,
        120,
        140,
        50,
        "/home\nuser files",
        {
          "tone": "file"
        }
      ],
      [
        "u01",
        "box",
        530,
        120,
        140,
        50,
        "/u01\nOracle DB",
        {
          "tone": "file"
        }
      ],
      [
        "tmp",
        "box",
        690,
        120,
        100,
        50,
        "/tmp\nscratch",
        {
          "tone": "file"
        }
      ],
      [
        "vlog",
        "doc",
        210,
        210,
        140,
        60,
        "/var/log\nsyslog, nginx",
        {
          "tone": "mem"
        }
      ],
      [
        "ohome",
        "doc",
        370,
        210,
        140,
        60,
        "/home/oracle\nscripts, .ssh",
        {
          "tone": "mem"
        }
      ],
      [
        "odata",
        "disk",
        530,
        210,
        140,
        60,
        "/u01/.../oradata\n.dbf files",
        {
          "tone": "mem"
        }
      ],
      [
        "term",
        "term",
        30,
        290,
        890,
        220,
        "Terminal · Navigation"
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
          ]
        ]
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
            "root",
            "etc",
            {
              "tone": "file"
            }
          ],
          [
            "link",
            "root",
            "var",
            {
              "tone": "file"
            }
          ],
          [
            "link",
            "root",
            "home",
            {
              "tone": "file"
            }
          ],
          [
            "link",
            "root",
            "u01",
            {
              "tone": "file"
            }
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
            "link",
            "home",
            "ohome",
            {
              "tone": "mem"
            }
          ],
          [
            "link",
            "u01",
            "odata",
            {
              "tone": "mem"
            }
          ]
        ]
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
            "term",
            "term",
            "oracle@prod-db01:~$ cd /var/log"
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
          ],
          [
            "pulse",
            "vlog"
          ]
        ]
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
            "term",
            "term",
            "oracle@prod-db01:/var/log$ cd .."
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:/var$ cd ~"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ cd -"
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
        ]
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
    ]
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
        "term",
        "term",
        30,
        40,
        890,
        460,
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
            "term"
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
        ]
      },
      {
        "say": "Har Linux professional `ls -la` use karta hai. `-a` se hidden files bhi dikhti hain aur `-l` se poora record: permissions (`drwxr-xr-x`), owner (`oracle`), size aur timestamp.",
        "code": [
          2,
          3
        ],
        "ops": [
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
        ]
      },
      {
        "say": "Raw bytes padhna mushkil hota hai (`4294967296` bytes!). `-h` flag lagane se size 4K, 12M, 4G mein dikhta hai, jise human-readable kehte hain.",
        "code": [
          4,
          5
        ],
        "ops": [
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
        ]
      },
      {
        "say": "Production incident mein sabse kaam aane wala command hai `ls -ltr`. `-t` time se sort karta hai aur `-r` use reverse karta hai, jisse sabse latest change aakhri line par dikhta hai!",
        "code": [
          6,
          7
        ],
        "ops": [
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
          ]
        ]
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
    ]
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
        "src",
        "doc",
        60,
        60,
        150,
        70,
        "config.env\noriginal",
        {
          "tone": "mem"
        }
      ],
      [
        "bak",
        "doc",
        280,
        60,
        150,
        70,
        "config.env.bak\nbackup copy",
        {
          "tone": "ok"
        }
      ],
      [
        "dir",
        "box",
        500,
        60,
        200,
        70,
        "backup/2026/oct\nmkdir -p",
        {
          "tone": "accent"
        }
      ],
      [
        "danger",
        "err",
        540,
        200,
        "rm -rf / : PRODUCTION TABAHI!",
        "middle"
      ],
      [
        "term",
        "term",
        30,
        260,
        890,
        250,
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
            "term"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ mkdir -p backup/2026/oct"
          ],
          [
            "pulse",
            "dir"
          ]
        ]
      },
      {
        "say": "`touch` command se turant khaali file ban jaati hai. Agar file pehle se ho, toh uska data nahi chhidta, sirf last modified time abhi ka ho jaata hai.",
        "code": [
          2,
          3
        ],
        "ops": [
          [
            "term",
            "term",
            "oracle@prod-db01:~$ touch app/health.check"
          ]
        ]
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
            "link",
            "src",
            "bak",
            {
              "label": "cp -p",
              "tone": "ok"
            }
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ cp -p app/config.env app/config.env.bak"
          ],
          [
            "ok",
            "bak"
          ]
        ]
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
            "term",
            "term",
            "oracle@prod-db01:~$ rm app/health.ok"
          ]
        ]
      },
      {
        "say": "Cheshtawani: `rm -rf` bina confirm kiye folder aur uske andar sab kuch mita deta hai. Linux mein koi \"Recycle Bin\" nahi hota! Kabhi bhi `rm -rf /` ya galat space wala path mat chalana.",
        "ops": [
          [
            "show",
            "danger"
          ],
          [
            "pulse",
            "danger"
          ]
        ]
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
    ]
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
        "doc",
        60,
        50,
        160,
        80,
        "syslog\n10,000 lines",
        {
          "tone": "file"
        }
      ],
      [
        "head",
        "box",
        270,
        40,
        160,
        45,
        "head -n 5\nTop 5 lines",
        {
          "tone": "accent"
        }
      ],
      [
        "tail",
        "box",
        270,
        95,
        160,
        45,
        "tail -n 10\nLast 10 lines",
        {
          "tone": "accent"
        }
      ],
      [
        "live",
        "box",
        470,
        60,
        200,
        70,
        "tail -f\nLive follow stream",
        {
          "tone": "ok"
        }
      ],
      [
        "warn",
        "err",
        730,
        70,
        "KABHI BHI 5GB LOG\nPAR CAT MAT KARO!",
        "middle"
      ],
      [
        "term",
        "term",
        30,
        230,
        890,
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
            "pulse",
            "warn"
          ]
        ]
      },
      {
        "say": "Pehle dekho file kitni lambi hai. `wc -l /var/log/syslog` se total line count milta hai.",
        "code": [
          0,
          1
        ],
        "ops": [
          [
            "term",
            "term",
            "oracle@prod-db01:~$ wc -l /var/log/syslog"
          ],
          [
            "out",
            "term",
            "12 /var/log/syslog"
          ]
        ]
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
        ]
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
        ]
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
            "term",
            "term",
            "oracle@prod-db01:~$ tail -f /var/log/nginx/access.log"
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
        ]
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
    ]
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
        "tree",
        "region",
        40,
        50,
        300,
        200,
        "Search Space",
        {
          "tone": "file",
          "sub": "/var/log/app"
        }
      ],
      [
        "f1",
        "doc",
        60,
        95,
        110,
        55,
        "app.log\n10MB",
        {
          "tone": "mem"
        }
      ],
      [
        "f2",
        "doc",
        200,
        95,
        120,
        55,
        "old_2025.tmp\n450MB · >7d",
        {
          "tone": "accent"
        }
      ],
      [
        "f3",
        "doc",
        130,
        170,
        130,
        60,
        "crashdump.tmp\n800MB · >7d",
        {
          "tone": "accent"
        }
      ],
      [
        "filter",
        "box",
        380,
        70,
        240,
        80,
        "find /var/log/app\n-name \"*.tmp\" -size +100M",
        {
          "tone": "proc"
        }
      ],
      [
        "res",
        "box",
        660,
        70,
        240,
        80,
        "Matched for Cleanup:\nold_2025.tmp (450M)\ncrashdump.tmp (800M)",
        {
          "tone": "ok"
        }
      ],
      [
        "term",
        "term",
        30,
        270,
        890,
        240,
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
            "term"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ which nginx"
          ],
          [
            "out",
            "term",
            "/usr/bin/nginx"
          ]
        ]
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
            "tree",
            "f1",
            "f2",
            "f3"
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
        ]
      },
      {
        "say": "Disk space bachaane ke liye sabse badi files pakadna: `-size +100M` ka matlab 100MB se badi files. `-type f` folders ko chhod kar sirf files dekhta hai.",
        "code": [
          4,
          5
        ],
        "ops": [
          [
            "show",
            "filter"
          ],
          [
            "pulse",
            "filter"
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
        ]
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
            "ok",
            "res"
          ]
        ]
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
    ]
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
        "inode",
        "disk",
        380,
        50,
        160,
        90,
        "Inode #98201\nData Blocks",
        {
          "tone": "accent"
        }
      ],
      [
        "f1",
        "box",
        140,
        50,
        160,
        45,
        "app-v1.0\n(Old Version)",
        {
          "tone": "muted"
        }
      ],
      [
        "f2",
        "box",
        140,
        115,
        160,
        45,
        "app-v1.1\n(New Version)",
        {
          "tone": "ok"
        }
      ],
      [
        "sym",
        "pill",
        640,
        80,
        240,
        50,
        "releases/current\n(Symlink)",
        {
          "tone": "proc"
        }
      ],
      [
        "term",
        "term",
        30,
        230,
        890,
        280,
        "Terminal · ln -s in Production"
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
            "inode"
          ],
          [
            "pulse",
            "inode"
          ]
        ]
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
        ]
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
            "f1",
            "f2",
            "sym"
          ],
          [
            "link",
            "sym",
            "f2",
            {
              "label": "points to",
              "tone": "ok"
            }
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
        ]
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
            "link",
            "sym",
            "f1",
            {
              "label": "rollback",
              "tone": "accent"
            }
          ],
          [
            "pulse",
            "sym"
          ],
          [
            "ok",
            "sym"
          ]
        ]
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
    ]
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
        "norm",
        "box",
        60,
        60,
        220,
        90,
        "Normal Mode (Default)\nNavigation · dd · yy · /search",
        {
          "tone": "accent"
        }
      ],
      [
        "ins",
        "box",
        360,
        60,
        220,
        90,
        "Insert Mode\nText typing (Type text here)",
        {
          "tone": "ok"
        }
      ],
      [
        "cmd",
        "box",
        660,
        60,
        220,
        90,
        "Command Mode (:)\n:wq (save) · :q! (abort)",
        {
          "tone": "proc"
        }
      ],
      [
        "term",
        "term",
        30,
        230,
        890,
        280,
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
            "norm",
            "ins",
            "cmd",
            "term"
          ],
          [
            "pulse",
            "norm"
          ]
        ]
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
            "link",
            "norm",
            "ins",
            {
              "label": "press i",
              "tone": "ok"
            }
          ],
          [
            "pulse",
            "ins"
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
        ]
      },
      {
        "say": "Likhne ke baad hamesha `Esc` button dabao taaki wapas Normal Mode mein aa sako. Yahan `dd` dabane se poori line delete hoti hai aur `u` dabane se Undo hota hai.",
        "code": [
          4
        ],
        "ops": [
          [
            "link",
            "ins",
            "norm",
            {
              "label": "press Esc",
              "tone": "accent"
            }
          ],
          [
            "pulse",
            "norm"
          ]
        ]
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
            "link",
            "norm",
            "cmd",
            {
              "label": "type :",
              "tone": "proc"
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
            "ok",
            "cmd"
          ]
        ]
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
    ]
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
        "cmd",
        "box",
        60,
        80,
        160,
        60,
        "Command\n(ls, backup.sh)",
        {
          "tone": "accent"
        }
      ],
      [
        "fd1",
        "pill",
        300,
        50,
        150,
        42,
        "1: stdout",
        {
          "tone": "ok"
        }
      ],
      [
        "fd2",
        "pill",
        300,
        130,
        150,
        42,
        "2: stderr",
        {
          "tone": "danger"
        }
      ],
      [
        "outf",
        "doc",
        540,
        40,
        150,
        60,
        "output.log\n(success)",
        {
          "tone": "ok"
        }
      ],
      [
        "errf",
        "doc",
        540,
        120,
        150,
        60,
        "error.log\n(failures)",
        {
          "tone": "danger"
        }
      ],
      [
        "null",
        "disk",
        760,
        80,
        130,
        70,
        "/dev/null\n(black hole)",
        {
          "tone": "muted"
        }
      ],
      [
        "term",
        "term",
        30,
        230,
        890,
        280,
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
            "cmd",
            "fd1",
            "fd2"
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
          ]
        ]
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
              "label": ">>",
              "tone": "ok"
            }
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ echo \"APP_ENV=production\" > app/test.env"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ echo \"PORT=8080\" >> app/test.env"
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
          ]
        ]
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
            "term",
            "term",
            "oracle@prod-db01:~$ cat error.log"
          ],
          [
            "out",
            "term",
            "ls: cannot access '/var/log/missing': No such file or directory"
          ]
        ]
      },
      {
        "say": "Production ka sabse famous pattern: `> file.log 2>&1`. Iska matlab hai: \"Success aur Error dono ko ek hi log file mein daalo\". Cron jobs mein yeh 100% zaroori hai.",
        "code": [
          7,
          8
        ],
        "ops": [
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
            "pulse",
            "outf"
          ]
        ]
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
              "tone": "muted"
            }
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ curl -s http://localhost:8080/health > /dev/null"
          ],
          [
            "ok",
            "cmd"
          ]
        ]
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
    ]
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
        40,
        70,
        160,
        55,
        "cat todo.txt\nRaw lines",
        {
          "tone": "file"
        }
      ],
      [
        "p1",
        "pill",
        220,
        75,
        50,
        40,
        "|",
        {
          "tone": "accent"
        }
      ],
      [
        "c2",
        "box",
        290,
        70,
        160,
        55,
        "sort\nAlphabetical",
        {
          "tone": "proc"
        }
      ],
      [
        "p2",
        "pill",
        470,
        75,
        50,
        40,
        "|",
        {
          "tone": "accent"
        }
      ],
      [
        "c3",
        "box",
        540,
        70,
        160,
        55,
        "uniq -c\nFrequency count",
        {
          "tone": "proc"
        }
      ],
      [
        "p3",
        "pill",
        720,
        75,
        50,
        40,
        "|",
        {
          "tone": "accent"
        }
      ],
      [
        "c4",
        "box",
        790,
        70,
        130,
        55,
        "sort -nr\nTop counts",
        {
          "tone": "ok"
        }
      ],
      [
        "term",
        "term",
        30,
        210,
        890,
        300,
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
          ]
        ]
      },
      {
        "say": "`cat todo.txt | sort` chalao: unorganized lines `sort` ke andar chali jaati hain aur sorted order mein screen par aati hain.",
        "code": [
          0,
          1
        ],
        "ops": [
          [
            "term",
            "term",
            "oracle@prod-db01:~$ cat todo.txt | sort"
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
          ]
        ]
      },
      {
        "say": "Hazaaron files ya processes mein filter lagana: `df -h | grep \"/var/log\"` se sirf wahi disk line dikhegi jisme `/var/log` ho.",
        "code": [
          2,
          3
        ],
        "ops": [
          [
            "term",
            "term",
            "oracle@prod-db01:~$ df -h | grep \"/var/log\""
          ],
          [
            "out",
            "term",
            "/dev/sda3        20G   17G  2.1G  89% /var/log"
          ]
        ]
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
            "term",
            "term",
            "oracle@prod-db01:~$ uptime | tee -a /tmp/health.log"
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
          ]
        ]
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
            "c3",
            "p3",
            "c4"
          ],
          [
            "link",
            "c2",
            "p2",
            {
              "tone": "accent"
            }
          ],
          [
            "link",
            "p2",
            "c3",
            {
              "tone": "accent"
            }
          ],
          [
            "link",
            "c3",
            "p3",
            {
              "tone": "accent"
            }
          ],
          [
            "link",
            "p3",
            "c4",
            {
              "tone": "ok"
            }
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ find . -name \"*.tmp\" | xargs ls -l"
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
        ]
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
    ]
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
        "syslog",
        "doc",
        50,
        60,
        180,
        80,
        "/var/log/syslog\n(10,000 lines)",
        {
          "tone": "file"
        }
      ],
      [
        "grep",
        "pill",
        320,
        75,
        180,
        50,
        "grep -i \"ERROR\"",
        {
          "tone": "accent"
        }
      ],
      [
        "res",
        "box",
        580,
        60,
        320,
        80,
        "Matched Lines Only:\n[1420] ERROR: Connection refused\nFailed with result: ERROR",
        {
          "tone": "ok"
        }
      ],
      [
        "term",
        "term",
        30,
        210,
        890,
        300,
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
            "syslog",
            "grep",
            "res",
            "term"
          ],
          [
            "link",
            "syslog",
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
        ]
      },
      {
        "say": "Logs mein kabhi `ERROR`, kabhi `error`, kabhi `Error` likha hota hai. Isliye hamesha `-i` (ignore case) lagana achhi aadat hai.",
        "code": [
          0,
          1
        ],
        "ops": [
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
        ]
      },
      {
        "say": "Agar poori lines nahi dekhni, sirf yeh dekhna hai ki error kitni baar aaya, toh `-c` (count) flag lagao.",
        "code": [
          2,
          3
        ],
        "ops": [
          [
            "term",
            "term",
            "oracle@prod-db01:~$ grep -i -c \"error\" /var/log/syslog"
          ],
          [
            "out",
            "term",
            "2"
          ]
        ]
      },
      {
        "say": "Job Trick #1: `-v` (invert match) se shor (noise) hataya jata hai. Nginx access log mein 99% requests `200 OK` hoti hain. `grep -v \"200\"` chalane se sirf failed requests (404, 500) samne aati hain!",
        "code": [
          4,
          5
        ],
        "ops": [
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
        ]
      },
      {
        "say": "`-E` se pipe `|` laga kar ek saath kai patterns search kar sakte ho, jaise `500|502|Connection refused`. Har DBA aur Sysadmin ka yeh daily habit hai.",
        "code": [
          6,
          7
        ],
        "ops": [
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
        ]
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
    ]
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
        "raw",
        "doc",
        40,
        60,
        170,
        70,
        "access.log\nRaw Web Traffic",
        {
          "tone": "file"
        }
      ],
      [
        "cut",
        "box",
        250,
        65,
        140,
        55,
        "cut -d\" \" -f1\nExtract IPs",
        {
          "tone": "accent"
        }
      ],
      [
        "sort1",
        "box",
        420,
        65,
        110,
        55,
        "sort\nGroup IPs",
        {
          "tone": "proc"
        }
      ],
      [
        "uniq",
        "box",
        560,
        65,
        130,
        55,
        "uniq -c\nCount counts",
        {
          "tone": "proc"
        }
      ],
      [
        "sort2",
        "box",
        720,
        65,
        140,
        55,
        "sort -nr\nTop Spammers",
        {
          "tone": "danger"
        }
      ],
      [
        "term",
        "term",
        30,
        210,
        890,
        300,
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
            "raw",
            "cut",
            "sort1",
            "uniq",
            "sort2",
            "term"
          ],
          [
            "link",
            "raw",
            "cut",
            {
              "tone": "accent"
            }
          ],
          [
            "link",
            "cut",
            "sort1",
            {
              "tone": "accent"
            }
          ],
          [
            "link",
            "sort1",
            "uniq",
            {
              "tone": "accent"
            }
          ],
          [
            "link",
            "uniq",
            "sort2",
            {
              "tone": "danger"
            }
          ]
        ]
      },
      {
        "say": "Pehle `cut -d\" \" -f1` lagao. Delimiter space hai, aur humein pehla column (IP) chahiye.",
        "code": [
          0,
          1
        ],
        "ops": [
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
        ]
      },
      {
        "say": "Important: `uniq` sirf sath judi hui (adjacent) duplicates pehchanta hai! Isliye `uniq` lagane se pehle `sort` lagana compulsory hai.",
        "code": [
          2,
          3
        ],
        "ops": [
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
        ]
      },
      {
        "say": "Ab aakhri step: sabse zyada hit karne wale IP ko top par lane ke liye `sort -nr` (numeric + reverse) lagao.",
        "code": [
          4,
          5
        ],
        "ops": [
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
          ],
          [
            "danger",
            "sort2"
          ]
        ]
      },
      {
        "say": "`cut` delimiter badal kar kisi bhi structured file par chal sakta hai, jaise `/etc/passwd` mein colon `:` delimiter hota hai.",
        "code": [
          6,
          7
        ],
        "ops": [
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
            "cut"
          ]
        ]
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
    ]
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
        "raw",
        "doc",
        50,
        70,
        220,
        80,
        "access.log\n203.0.113.9 - - [date] \"POST /api\" 500 284",
        {
          "tone": "file"
        }
      ],
      [
        "awk",
        "box",
        340,
        75,
        200,
        70,
        "awk '$9 == \"500\" {\n  print $1, $7, $9\n}'",
        {
          "tone": "accent"
        }
      ],
      [
        "res",
        "box",
        620,
        70,
        260,
        80,
        "Filtered Output:\n203.0.113.9 /api/checkout 500",
        {
          "tone": "danger"
        }
      ],
      [
        "term",
        "term",
        30,
        220,
        890,
        290,
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
            "raw",
            "awk",
            "res",
            "term"
          ],
          [
            "link",
            "raw",
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
              "tone": "danger"
            }
          ]
        ]
      },
      {
        "say": "Nginx log se IP ($1) aur HTTP status ($9) print karo. Simple `{print $1, $9}` syntax.",
        "code": [
          0,
          1
        ],
        "ops": [
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
        ]
      },
      {
        "say": "Ab condition lagao: Humein sirf wahi records chahiye jahan status code ($9) 500 ho, aur sath mein URL ($7) bhi dekhna hai.",
        "code": [
          2,
          3
        ],
        "ops": [
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
          ],
          [
            "danger",
            "res"
          ]
        ]
      },
      {
        "say": "Trick: Agar pata na ho ki line mein kitne columns hain par hamesha aakhri column chahiye, toh `$NF` use karo (`NF` = Number of Fields).",
        "code": [
          4,
          5
        ],
        "ops": [
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
        ]
      },
      {
        "say": "Delimiter colon `:` karne ke liye `-F\":\"` lagao. `/etc/passwd` se username ($1) aur shell ($7) ek jhatke mein print ho jayenge.",
        "code": [
          6,
          7
        ],
        "ops": [
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
          ]
        ]
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
    ]
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
        "orig",
        "doc",
        60,
        70,
        200,
        75,
        "app.env\nPORT=3000\nENV=dev",
        {
          "tone": "file"
        }
      ],
      [
        "sed",
        "box",
        340,
        75,
        200,
        65,
        "sed -i\n's/3000/8080/g'",
        {
          "tone": "accent"
        }
      ],
      [
        "mod",
        "doc",
        620,
        70,
        200,
        75,
        "app.env\nPORT=8080\nENV=dev",
        {
          "tone": "ok"
        }
      ],
      [
        "term",
        "term",
        30,
        215,
        890,
        295,
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
            "orig",
            "sed",
            "mod",
            "term"
          ],
          [
            "link",
            "orig",
            "sed",
            {
              "tone": "accent"
            }
          ],
          [
            "link",
            "sed",
            "mod",
            {
              "tone": "ok"
            }
          ]
        ]
      },
      {
        "say": "Safety Rule: Hamesha pehle bina `-i` ke chala kar screen par output verify karo. Dekho ki replacement sahi ho raha hai ya nahi.",
        "code": [
          0,
          1
        ],
        "ops": [
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
        ]
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
          ],
          [
            "ok",
            "mod"
          ]
        ]
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
        ]
      },
      {
        "say": "`sed '/^#/d'` se config files mein se saare faltu comments `#` delete ho jaate hain aur sirf kaam ki lines dikhti hain.",
        "code": [
          8,
          9
        ],
        "ops": [
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
          ]
        ]
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
    ]
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
        "pill",
        60,
        60,
        160,
        48,
        "root (UID: 0)\nSuperuser",
        {
          "tone": "danger"
        }
      ],
      [
        "ora",
        "pill",
        60,
        120,
        160,
        48,
        "oracle (UID: 1000)\nDatabase Admin",
        {
          "tone": "accent"
        }
      ],
      [
        "app",
        "pill",
        60,
        180,
        160,
        48,
        "appuser (UID: 1001)\nService Account",
        {
          "tone": "ok"
        }
      ],
      [
        "pwd",
        "doc",
        320,
        90,
        240,
        100,
        "/etc/passwd\nuser:x:UID:GID:info:home:shell",
        {
          "tone": "file"
        }
      ],
      [
        "shd",
        "disk",
        640,
        90,
        220,
        100,
        "/etc/shadow\nEncrypted hashes (root only)",
        {
          "tone": "muted"
        }
      ],
      [
        "term",
        "term",
        30,
        230,
        890,
        280,
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
            "pwd",
            "shd",
            "term"
          ],
          [
            "link",
            "ora",
            "pwd",
            {
              "tone": "accent"
            }
          ],
          [
            "link",
            "pwd",
            "shd",
            {
              "tone": "muted"
            }
          ]
        ]
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
          ],
          [
            "ok",
            "ora"
          ]
        ]
      },
      {
        "say": "`/etc/passwd` file ke har record mein 7 columns hote hain: `username:password_flag:UID:GID:GECOS:home_dir:shell`.",
        "code": [
          4,
          5
        ],
        "ops": [
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
        ]
      },
      {
        "say": "Notice karo password column mein `x` likha hai. Security ke liye real password hashes `/etc/shadow` mein hote hain, jo sirf root padh sakta hai.",
        "code": [
          6,
          7
        ],
        "ops": [
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
        ]
      },
      {
        "say": "Command `w` ya `who` se pata chalta hai ki server par is waqt kaun kaun log SSH session lekar baithe hain.",
        "code": [
          8,
          9
        ],
        "ops": [
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
          ]
        ]
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
    ]
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
        "u",
        "box",
        60,
        60,
        180,
        85,
        "User (Owner)\nr w x = 4+2+1\nScore: 7",
        {
          "tone": "ok"
        }
      ],
      [
        "g",
        "box",
        270,
        60,
        180,
        85,
        "Group (Team)\nr - x = 4+0+1\nScore: 5",
        {
          "tone": "accent"
        }
      ],
      [
        "o",
        "box",
        480,
        60,
        180,
        85,
        "Others (World)\nr - x = 4+0+1\nScore: 5",
        {
          "tone": "muted"
        }
      ],
      [
        "res",
        "pill",
        690,
        75,
        200,
        55,
        "755 (rwxr-xr-x)\nStandard Executable",
        {
          "tone": "proc"
        }
      ],
      [
        "term",
        "term",
        30,
        210,
        890,
        305,
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
            "u",
            "g",
            "o",
            "res",
            "term"
          ],
          [
            "link",
            "u",
            "res",
            {
              "tone": "ok"
            }
          ],
          [
            "link",
            "g",
            "res",
            {
              "tone": "accent"
            }
          ],
          [
            "link",
            "o",
            "res",
            {
              "tone": "muted"
            }
          ]
        ]
      },
      {
        "say": "Check karo `scripts/backup_db.sh`. Agar execute bit missing ho (`-rw-r--r--`), toh `./backup_db.sh` chalane par `Permission denied` error aayega.",
        "code": [
          0,
          1
        ],
        "ops": [
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
        ]
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
          ],
          [
            "ok",
            "res"
          ]
        ]
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
        ]
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
        ]
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
    ]
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
        "box",
        60,
        60,
        160,
        60,
        "oracle user\n(normal privileges)",
        {
          "tone": "accent"
        }
      ],
      [
        "sudo",
        "pill",
        280,
        65,
        140,
        50,
        "sudo gate\n/etc/sudoers",
        {
          "tone": "proc"
        }
      ],
      [
        "rootcmd",
        "box",
        480,
        60,
        180,
        60,
        "Root Command\n(systemctl, chown)",
        {
          "tone": "danger"
        }
      ],
      [
        "audit",
        "doc",
        720,
        60,
        180,
        60,
        "auth.log\nAudited timestamp",
        {
          "tone": "ok"
        }
      ],
      [
        "term",
        "term",
        30,
        210,
        890,
        305,
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
            "sudo",
            "rootcmd",
            "audit",
            "term"
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
              "tone": "danger"
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
        ]
      },
      {
        "say": "`ls -l` mein permissions ke baad do naam hote hain: pehla `owner` (user), doosra `group`. Yahan `app/app.env` ka owner check karo.",
        "code": [
          0,
          1
        ],
        "ops": [
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
        ]
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
            "term",
            "term",
            "oracle@prod-db01:~$ ls -l app/app.env"
          ],
          [
            "out",
            "term",
            "-rw------- 1 oracle oinstall 80 Oct 29 10:15 app/app.env"
          ],
          [
            "ok",
            "usr"
          ]
        ]
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
            "pulse",
            "usr"
          ]
        ]
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
            "danger",
            "rootcmd"
          ],
          [
            "ok",
            "audit"
          ]
        ]
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
    ]
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
        "proc",
        "box",
        60,
        60,
        180,
        80,
        "payapi (PID: 1420)\nHigh CPU / Hung",
        {
          "tone": "danger"
        }
      ],
      [
        "sig15",
        "pill",
        320,
        50,
        160,
        42,
        "kill -15 (SIGTERM)\nGraceful Stop",
        {
          "tone": "accent"
        }
      ],
      [
        "sig9",
        "pill",
        320,
        130,
        160,
        42,
        "kill -9 (SIGKILL)\nForce Termination",
        {
          "tone": "danger"
        }
      ],
      [
        "kernel",
        "box",
        560,
        60,
        180,
        80,
        "Linux Kernel\nProcess cleanup",
        {
          "tone": "proc"
        }
      ],
      [
        "done",
        "disk",
        800,
        75,
        110,
        50,
        "Terminated\nResources freed",
        {
          "tone": "ok"
        }
      ],
      [
        "term",
        "term",
        30,
        220,
        890,
        290,
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
            "proc",
            "sig15",
            "sig9",
            "kernel",
            "term"
          ],
          [
            "link",
            "proc",
            "sig15",
            {
              "tone": "accent"
            }
          ],
          [
            "link",
            "proc",
            "sig9",
            {
              "tone": "danger"
            }
          ]
        ]
      },
      {
        "say": "PID 1420 dhoondho. Output mein user, PID, %CPU, %MEM aur exact startup command milti hai.",
        "code": [
          0,
          1
        ],
        "ops": [
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
        ]
      },
      {
        "say": "Production Rule #1: Hamesha pehle `kill -15 <PID>` (SIGTERM) bhejo taaki database connections close ho sakein aur logs write ho sakein.",
        "code": [
          2,
          3
        ],
        "ops": [
          [
            "link",
            "sig15",
            "kernel",
            {
              "tone": "accent"
            }
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ kill -15 1420"
          ]
        ]
      },
      {
        "say": "Agar 10 second baad bhi process unresponsive ho aur band na ho, tab aakhri hathiyar chalao: `kill -9 <PID>` (SIGKILL).",
        "code": [
          4,
          5
        ],
        "ops": [
          [
            "link",
            "sig9",
            "kernel",
            {
              "tone": "danger"
            }
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ kill -9 1420"
          ],
          [
            "show",
            "done"
          ],
          [
            "link",
            "kernel",
            "done",
            {
              "tone": "ok"
            }
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
          ],
          [
            "ok",
            "done"
          ]
        ]
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
            "pulse",
            "kernel"
          ]
        ]
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
    ]
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
        60,
        60,
        160,
        60,
        "SSH Terminal\n(Laptop session)",
        {
          "tone": "accent"
        }
      ],
      [
        "hup",
        "pill",
        270,
        65,
        120,
        50,
        "SIGHUP\n(Disconnect)",
        {
          "tone": "danger"
        }
      ],
      [
        "nohup",
        "box",
        440,
        60,
        180,
        60,
        "nohup Shield\nIgnores SIGHUP",
        {
          "tone": "ok"
        }
      ],
      [
        "job",
        "proc",
        670,
        60,
        200,
        60,
        "backup_db.sh &\nRunning in background",
        {
          "tone": "proc"
        }
      ],
      [
        "term",
        "term",
        30,
        200,
        890,
        310,
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
            "nohup",
            "job",
            "term"
          ],
          [
            "link",
            "ssh",
            "hup",
            {
              "tone": "danger"
            }
          ],
          [
            "link",
            "hup",
            "nohup",
            {
              "tone": "muted"
            }
          ],
          [
            "link",
            "nohup",
            "job",
            {
              "tone": "ok"
            }
          ]
        ]
      },
      {
        "say": "Command ke aakhir mein `&` lagao. Terminal tumhe Job Number `[1]` aur Process ID `2450` dega, aur prompt foran free ho jayega.",
        "code": [
          0,
          1
        ],
        "ops": [
          [
            "term",
            "term",
            "oracle@prod-db01:~$ ./scripts/backup_db.sh &"
          ],
          [
            "out",
            "term",
            "[1] 2450"
          ]
        ]
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
            "out",
            "term",
            "./scripts/backup_db.sh",
            "Backing up database tablespaces... [in progress]"
          ]
        ]
      },
      {
        "say": "Senior DevOps Formula: `nohup <cmd> > file.log 2>&1 &`. Isse: 1. Terminal band hone par bhi process chalega. 2. Output aur errors log file mein judenge. 3. Prompt foran free hoga.",
        "code": [
          6,
          7
        ],
        "ops": [
          [
            "term",
            "term",
            "oracle@prod-db01:~$ nohup ./scripts/backup_db.sh > /var/log/oracle/backup.log 2>&1 &"
          ],
          [
            "out",
            "term",
            "[1] 2460"
          ],
          [
            "ok",
            "job"
          ]
        ]
      },
      {
        "say": "Terminal band karke naye laptop se aao, `ps aux | grep backup_db` se check karo. Script maze se background mein chal rahi hogi.",
        "code": [
          8,
          9
        ],
        "ops": [
          [
            "term",
            "term",
            "oracle@prod-db01:~$ ps aux | grep backup_db"
          ],
          [
            "out",
            "term",
            "oracle    2460  1.2  0.4  18400  8400 ?        S    10:35   0:01 /bin/bash ./scripts/backup_db.sh"
          ]
        ]
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
    ]
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
        "cpu",
        "box",
        50,
        60,
        180,
        80,
        "CPU Cores (4 Cores)\nLoad: 0.28, 0.42, 0.35",
        {
          "tone": "ok"
        }
      ],
      [
        "ram",
        "box",
        270,
        60,
        200,
        80,
        "RAM: 16 GB\nUsed: 4.2G | Avail: 11.2G",
        {
          "tone": "ok"
        }
      ],
      [
        "cache",
        "box",
        510,
        60,
        180,
        80,
        "Page Cache: 7.1G\n(Safely reclaimable)",
        {
          "tone": "accent"
        }
      ],
      [
        "swap",
        "box",
        730,
        60,
        170,
        80,
        "Swap: 4.0 GB\nUsed: 0 MB (Healthy)",
        {
          "tone": "ok"
        }
      ],
      [
        "term",
        "term",
        30,
        210,
        890,
        300,
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
            "cpu",
            "ram",
            "cache",
            "swap",
            "term"
          ],
          [
            "link",
            "cpu",
            "ram",
            {
              "tone": "accent"
            }
          ],
          [
            "link",
            "ram",
            "cache",
            {
              "tone": "ok"
            }
          ],
          [
            "link",
            "ram",
            "swap",
            {
              "tone": "ok"
            }
          ]
        ]
      },
      {
        "say": "`uptime` ke aakhir mein 3 numbers hote hain: 1 min, 5 min, 15 min ka load average. Agar 4 CPU cores hain aur load 10.0 hai, matlab server par bhari traffic jam hai.",
        "code": [
          0,
          1
        ],
        "ops": [
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
        ]
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
        ]
      },
      {
        "say": "Gold Metric: Kabhi `free` column mat dekho! Hamesha aakhri column `available` dekho. Yeh batata hai ki apps ke liye real kitni RAM bachi hai.",
        "code": [
          6,
          7
        ],
        "ops": [
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
        ]
      },
      {
        "say": "`vmstat` mein `wa` column dekho: agar `wa` (IO Wait) 30-40% se upar ho, toh CPU nahi balki disk slow hai (database slow query ya disk bottleneck).",
        "code": [
          8,
          9
        ],
        "ops": [
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
          ],
          [
            "ok",
            "cpu"
          ]
        ]
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
    ]
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
        "pill",
        60,
        60,
        160,
        50,
        "systemd (PID 1)\nMaster Init",
        {
          "tone": "accent"
        }
      ],
      [
        "nginx",
        "box",
        300,
        45,
        170,
        55,
        "nginx.service\nActive (running)",
        {
          "tone": "ok"
        }
      ],
      [
        "payapi",
        "box",
        300,
        115,
        170,
        55,
        "payapi.service\nInactive (failed)",
        {
          "tone": "danger"
        }
      ],
      [
        "jrn",
        "doc",
        550,
        80,
        180,
        70,
        "journalctl -u\nCentralized Logs",
        {
          "tone": "proc"
        }
      ],
      [
        "boot",
        "disk",
        780,
        80,
        130,
        70,
        "systemctl enable\nAuto-start on boot",
        {
          "tone": "ok"
        }
      ],
      [
        "term",
        "term",
        30,
        220,
        890,
        290,
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
            "jrn",
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
          ],
          [
            "link",
            "payapi",
            "jrn",
            {
              "tone": "proc"
            }
          ]
        ]
      },
      {
        "say": "Nginx ka status dekho: `Active: active (running)` green light hai aur PID 1102 hai.",
        "code": [
          0,
          1
        ],
        "ops": [
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
        ]
      },
      {
        "say": "Ab dekho `payapi`: yeh `failed` state mein hai! Production alert yahan trigger hota hai.",
        "code": [
          2,
          3
        ],
        "ops": [
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
          ],
          [
            "danger",
            "payapi"
          ]
        ]
      },
      {
        "say": "Kyun fail hua? Reason dhoondhne ke liye `journalctl -u payapi` chalao. Logs mein saaf dikhega: \"Connection refused to database\".",
        "code": [
          6,
          7
        ],
        "ops": [
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
        ]
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
            "link",
            "payapi",
            "boot",
            {
              "tone": "ok"
            }
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ sudo systemctl start payapi"
          ],
          [
            "term",
            "term",
            "oracle@prod-db01:~$ sudo systemctl enable payapi"
          ],
          [
            "out",
            "term",
            "Created symlink /etc/systemd/system/multi-user.target.wants/payapi.service → /etc/systemd/system/payapi.service."
          ],
          [
            "ok",
            "payapi"
          ]
        ]
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
    ]
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
        "disk",
        "disk",
        60,
        60,
        160,
        80,
        "/var/log\n89% Full (Warning)",
        {
          "tone": "danger"
        }
      ],
      [
        "du",
        "box",
        290,
        65,
        170,
        70,
        "du -sh /var/log/*\nBig file hunter",
        {
          "tone": "accent"
        }
      ],
      [
        "culprit",
        "doc",
        520,
        60,
        170,
        80,
        "old_syslog.log\n15 GB waste",
        {
          "tone": "danger"
        }
      ],
      [
        "clean",
        "box",
        750,
        65,
        150,
        70,
        "> logfile\nInstant space free",
        {
          "tone": "ok"
        }
      ],
      [
        "term",
        "term",
        30,
        210,
        890,
        300,
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
            "disk",
            "du",
            "culprit",
            "clean",
            "term"
          ],
          [
            "link",
            "disk",
            "du",
            {
              "tone": "accent"
            }
          ],
          [
            "link",
            "du",
            "culprit",
            {
              "tone": "danger"
            }
          ],
          [
            "link",
            "culprit",
            "clean",
            {
              "tone": "ok"
            }
          ]
        ]
      },
      {
        "say": "Partition check karo: `/var/log` 89% full hai aur 2.1G hi bacha hai. Agar yeh 100% ho gaya toh system freeze ho jayega.",
        "code": [
          0,
          1
        ],
        "ops": [
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
            "danger",
            "disk"
          ]
        ]
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
          ],
          [
            "danger",
            "culprit"
          ]
        ]
      },
      {
        "say": "Classic Trap: Agar tumne `rm big.log` chala diya par koi process usme likh raha tha, toh file gayab ho jayegi par disk free nahi hogi! Isko `lsof | grep deleted` se pakda jata hai.",
        "code": [
          5,
          6
        ],
        "ops": [
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
        ]
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
            "term",
            "term",
            "oracle@prod-db01:~$ ls -lh /tmp/junk.log"
          ],
          [
            "out",
            "term",
            "-rw-r--r-- 1 oracle oinstall 0 Oct 29 10:45 /tmp/junk.log"
          ],
          [
            "ok",
            "clean"
          ]
        ]
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
    ]
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
        "disk",
        "disk",
        50,
        60,
        180,
        80,
        "/dev/sdb1 (200GB)\nRaw partition (XFS)",
        {
          "tone": "accent"
        }
      ],
      [
        "mntcmd",
        "pill",
        290,
        75,
        150,
        48,
        "mount /dev/sdb1\n/u01",
        {
          "tone": "proc"
        }
      ],
      [
        "dir",
        "box",
        500,
        60,
        170,
        80,
        "Directory /u01\nMount Point Folder",
        {
          "tone": "ok"
        }
      ],
      [
        "fstab",
        "doc",
        740,
        60,
        180,
        80,
        "/etc/fstab\nAuto-mount on reboot",
        {
          "tone": "file"
        }
      ],
      [
        "term",
        "term",
        30,
        210,
        890,
        300,
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
            "disk",
            "mntcmd",
            "dir",
            "fstab",
            "term"
          ],
          [
            "link",
            "disk",
            "mntcmd",
            {
              "tone": "accent"
            }
          ],
          [
            "link",
            "mntcmd",
            "dir",
            {
              "tone": "ok"
            }
          ],
          [
            "link",
            "dir",
            "fstab",
            {
              "tone": "file"
            }
          ]
        ]
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
          ]
        ]
      },
      {
        "say": "Check karo `/u01` par kaunsa filesystem laga hai: `mount | grep \"/u01\"` se pata chalta hai yeh `ext4` ya `xfs` filesystem hai jo `rw` (read-write) mounted hai.",
        "code": [
          2,
          3
        ],
        "ops": [
          [
            "term",
            "term",
            "oracle@prod-db01:~$ mount | grep \"/u01\""
          ],
          [
            "out",
            "term",
            "/dev/sdb1 on /u01 type ext4 (rw,relatime)"
          ]
        ]
      },
      {
        "say": "Drives ko reboot ke baad zinda rakhne ke liye `/etc/fstab` mein entry ki jaati hai: `UUID=<id> /u01 ext4 defaults 0 2`.",
        "code": [
          4,
          5
        ],
        "ops": [
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
        ]
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
            "ok",
            "fstab"
          ]
        ]
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
    ]
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
        "box",
        50,
        60,
        180,
        80,
        "app/ & scripts/\nLoose source files",
        {
          "tone": "file"
        }
      ],
      [
        "tar",
        "box",
        290,
        65,
        170,
        70,
        "tar -czvf\nArchive + Gzip",
        {
          "tone": "accent"
        }
      ],
      [
        "targz",
        "disk",
        520,
        60,
        170,
        80,
        "app_backup.tar.gz\nCompressed bundle",
        {
          "tone": "ok"
        }
      ],
      [
        "rsync",
        "pill",
        750,
        70,
        150,
        50,
        "rsync -avz\nDelta Network Sync",
        {
          "tone": "proc"
        }
      ],
      [
        "term",
        "term",
        30,
        210,
        890,
        300,
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
            "tar",
            "targz",
            "rsync",
            "term"
          ],
          [
            "link",
            "src",
            "tar",
            {
              "tone": "accent"
            }
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
            "link",
            "targz",
            "rsync",
            {
              "tone": "proc"
            }
          ]
        ]
      },
      {
        "say": "Formula yaad rakho: `tar -czvf <archive.tar.gz> <source_folder>`. `c`=create, `z`=gzip, `v`=verbose, `f`=file.",
        "code": [
          0,
          1
        ],
        "ops": [
          [
            "term",
            "term",
            "oracle@prod-db01:~$ tar -czvf app_backup.tar.gz app/"
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
        ]
      },
      {
        "say": "Archive kholne se pehle dekhna ho ki andar kya hai, toh `t` (test/table) flag use karo: `tar -tzvf app_backup.tar.gz`.",
        "code": [
          2,
          3
        ],
        "ops": [
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
        ]
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
            "term",
            "term",
            "oracle@prod-db01:~$ tar -xzvf app_backup.tar.gz -C /tmp/"
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
          ]
        ]
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
            "term",
            "term",
            "oracle@prod-db01:~$ rsync -av app/ /tmp/app_sync/"
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
        ]
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
    ]
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
        50,
        60,
        160,
        75,
        "prod-db01\n192.168.1.10 (eth0)",
        {
          "tone": "accent"
        }
      ],
      [
        "gw",
        "pill",
        270,
        70,
        140,
        50,
        "Default Gateway\n192.168.1.1",
        {
          "tone": "proc"
        }
      ],
      [
        "dns",
        "disk",
        480,
        60,
        160,
        75,
        "DNS Resolver\n/etc/resolv.conf\n(8.8.8.8)",
        {
          "tone": "file"
        }
      ],
      [
        "remote",
        "box",
        710,
        60,
        180,
        75,
        "Remote Service / DB\napi.payment.com",
        {
          "tone": "ok"
        }
      ],
      [
        "term",
        "term",
        30,
        210,
        890,
        300,
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
            "gw",
            "dns",
            "remote",
            "term"
          ],
          [
            "link",
            "srv",
            "gw",
            {
              "tone": "accent"
            }
          ],
          [
            "link",
            "gw",
            "dns",
            {
              "tone": "proc"
            }
          ],
          [
            "link",
            "dns",
            "remote",
            {
              "tone": "ok"
            }
          ]
        ]
      },
      {
        "say": "Pehle `ip a` chalao (deprecated `ifconfig` ki jagah). Yahan `eth0` interface par IP `192.168.1.10/24` dikhayi dega.",
        "code": [
          0,
          1
        ],
        "ops": [
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
        ]
      },
      {
        "say": "Default gateway check karne ke liye `ip route` chalao. Yahan `default via 192.168.1.1` router ka address hai.",
        "code": [
          2,
          3
        ],
        "ops": [
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
          ]
        ]
      },
      {
        "say": "Agar IP ping ho raha hai par domain name resolve nahi ho raha, toh `/etc/resolv.conf` dekho ki kaunsa DNS nameserver set hai.",
        "code": [
          4,
          5
        ],
        "ops": [
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
        ]
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
        ]
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
    ]
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
        "p22",
        "pill",
        60,
        60,
        160,
        50,
        "Port 22 (SSH)\nsshd (PID: 890)",
        {
          "tone": "ok"
        }
      ],
      [
        "p80",
        "pill",
        60,
        130,
        160,
        50,
        "Port 80 (HTTP)\nnginx (PID: 1102)",
        {
          "tone": "ok"
        }
      ],
      [
        "p1521",
        "pill",
        60,
        200,
        160,
        50,
        "Port 1521 (TNS)\noracle (PID: 1250)",
        {
          "tone": "accent"
        }
      ],
      [
        "ss",
        "box",
        320,
        110,
        200,
        80,
        "ss -tulpn\nSocket Inspector",
        {
          "tone": "proc"
        }
      ],
      [
        "report",
        "doc",
        620,
        85,
        270,
        130,
        "Active Listening Ports:\n22   -> sshd\n80   -> nginx\n1521 -> oracle tnslsnr\n8080 -> payapi (down)",
        {
          "tone": "file"
        }
      ],
      [
        "term",
        "term",
        30,
        275,
        890,
        240,
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
            "p22",
            "p80",
            "p1521",
            "ss",
            "report",
            "term"
          ],
          [
            "link",
            "p22",
            "ss",
            {
              "tone": "ok"
            }
          ],
          [
            "link",
            "p80",
            "ss",
            {
              "tone": "ok"
            }
          ],
          [
            "link",
            "p1521",
            "ss",
            {
              "tone": "accent"
            }
          ],
          [
            "link",
            "ss",
            "report",
            {
              "tone": "proc"
            }
          ]
        ]
      },
      {
        "say": "Flags yaad rakho: `t` (TCP) + `u` (UDP) + `l` (listening) + `p` (process name) + `n` (numeric ports) = `ss -tulpn`.",
        "code": [
          0,
          1
        ],
        "ops": [
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
        ]
      },
      {
        "say": "Oracle DBA Check: `ss -tulpn | grep 1521` se confirm karo ki TNS Listener port 1521 par active listen kar raha hai ya nahi.",
        "code": [
          2,
          3
        ],
        "ops": [
          [
            "term",
            "term",
            "oracle@prod-db01:~$ ss -tulpn | grep 1521"
          ],
          [
            "out",
            "term",
            "tcp   LISTEN 0      128          0.0.0.0:1521       0.0.0.0:*     users:((\"tnslsnr\",pid=1250,fd=8))"
          ],
          [
            "ok",
            "p1521"
          ]
        ]
      },
      {
        "say": "Targeted Search: `lsof -i :80` seedha us process ka user, PID aur exact command nikaal deta hai jo port 80 par baithi hai.",
        "code": [
          4,
          5
        ],
        "ops": [
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
          ],
          [
            "ok",
            "p80"
          ]
        ]
      },
      {
        "say": "Port 8080 check karo: agar koi output na aaye, matlab port khaali hai aur service band ya crashed hai.",
        "code": [
          6,
          7
        ],
        "ops": [
          [
            "term",
            "term",
            "oracle@prod-db01:~$ ss -tulpn | grep 8080"
          ],
          [
            "pulse",
            "report"
          ]
        ]
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
    ]
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
        "client",
        "box",
        50,
        60,
        180,
        80,
        "Local Laptop\nPrivate Key\n(~/.ssh/id_ed25519)",
        {
          "tone": "accent"
        }
      ],
      [
        "tunnel",
        "pill",
        320,
        75,
        160,
        48,
        "SSH Tunnel (22)\nEncrypted Handshake",
        {
          "tone": "proc"
        }
      ],
      [
        "server",
        "box",
        570,
        60,
        200,
        80,
        "prod-db01 Server\n~/.ssh/authorized_keys\nPublic Key",
        {
          "tone": "ok"
        }
      ],
      [
        "scpbox",
        "disk",
        830,
        65,
        100,
        70,
        "scp file\nEncrypted Copy",
        {
          "tone": "file"
        }
      ],
      [
        "term",
        "term",
        30,
        210,
        890,
        300,
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
            "client",
            "tunnel",
            "server",
            "scpbox",
            "term"
          ],
          [
            "link",
            "client",
            "tunnel",
            {
              "tone": "accent"
            }
          ],
          [
            "link",
            "tunnel",
            "server",
            {
              "tone": "ok"
            }
          ],
          [
            "link",
            "tunnel",
            "scpbox",
            {
              "tone": "file"
            }
          ]
        ]
      },
      {
        "say": "Key generate karo: `ssh-keygen -t ed25519`. Isse do files banti hain: secret private key (`id_ed25519`) aur public key (`id_ed25519.pub`).",
        "code": [
          0,
          1
        ],
        "ops": [
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
        ]
      },
      {
        "say": "Public key screen par dekho. Yeh lambi string remote server ki `~/.ssh/authorized_keys` file ke andar daali jaati hai.",
        "code": [
          2,
          3
        ],
        "ops": [
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
        ]
      },
      {
        "say": "Shortcut: `ssh-copy-id user@server` chalao toh yeh automatically public key remote server ke `~/.ssh/authorized_keys` mein append kar deta hai.",
        "code": [
          4,
          5
        ],
        "ops": [
          [
            "term",
            "term",
            "oracle@prod-db01:~$ cat ~/.ssh/authorized_keys"
          ],
          [
            "out",
            "term",
            "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExampleAdminKey2026Ed25519Signature admin@company.com"
          ],
          [
            "ok",
            "server"
          ]
        ]
      },
      {
        "say": "Ab files bhejne ke liye `scp` (Secure Copy) use karo. Syntax: `scp <local_file> <user>@<server>:<remote_path>`. Bina password maange file instant transfer!",
        "code": [
          6,
          7
        ],
        "ops": [
          [
            "term",
            "term",
            "oracle@prod-db01:~$ scp app/app.env oracle@192.168.1.20:/tmp/app.env"
          ],
          [
            "out",
            "term",
            "app.env                                       100%   80   24.1KB/s   00:00"
          ],
          [
            "ok",
            "scpbox"
          ]
        ]
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
    ]
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
        50,
        60,
        160,
        80,
        "curl command\nTerminal client",
        {
          "tone": "accent"
        }
      ],
      [
        "fw",
        "pill",
        280,
        75,
        140,
        50,
        "ufw Firewall\nAllow 80 / Block IP",
        {
          "tone": "danger"
        }
      ],
      [
        "nginx",
        "box",
        490,
        60,
        160,
        80,
        "Nginx Web Srv\nHTTP 200 OK",
        {
          "tone": "ok"
        }
      ],
      [
        "api",
        "box",
        720,
        60,
        170,
        80,
        "Payment API :8080\nJSON Healthcheck",
        {
          "tone": "proc"
        }
      ],
      [
        "term",
        "term",
        30,
        210,
        890,
        300,
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
            "nginx",
            "api",
            {
              "tone": "proc"
            }
          ]
        ]
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
        ]
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
            "out",
            "term",
            "{\"status\":\"UP\",\"service\":\"payapi\",\"database\":\"connected\",\"timestamp\":\"2026-10-29T10:50:00Z\"}"
          ],
          [
            "ok",
            "api"
          ]
        ]
      },
      {
        "say": "Ab security perimeter dekho: `sudo ufw status` se check karo kaunse ports khule hain aur kaunse blocked hain.",
        "code": [
          4,
          5
        ],
        "ops": [
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
        ]
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
            "term",
            "term",
            "oracle@prod-db01:~$ sudo ufw deny from 203.0.113.9"
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
            "danger",
            "fw"
          ]
        ]
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
    ]
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
        50,
        60,
        180,
        80,
        "Ubuntu Repositories\n(Cloud Mirrors)",
        {
          "tone": "file"
        }
      ],
      [
        "apt",
        "box",
        310,
        65,
        170,
        70,
        "apt update / install\nDependency resolver",
        {
          "tone": "accent"
        }
      ],
      [
        "pkg",
        "box",
        560,
        60,
        180,
        80,
        "Installed Binary\n/usr/bin/nginx",
        {
          "tone": "ok"
        }
      ],
      [
        "dpkg",
        "doc",
        790,
        60,
        130,
        80,
        "dpkg -l\nInstalled DB",
        {
          "tone": "proc"
        }
      ],
      [
        "term",
        "term",
        30,
        210,
        890,
        300,
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
            "pkg",
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
            "pkg",
            {
              "tone": "accent"
            }
          ],
          [
            "link",
            "pkg",
            "dpkg",
            {
              "tone": "ok"
            }
          ]
        ]
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
            "out",
            "term",
            "Hit:1 http://archive.ubuntu.com/ubuntu jammy InRelease",
            "Hit:2 http://security.ubuntu.com/ubuntu jammy-security InRelease",
            "Reading package lists... Done",
            "Building dependency tree... Done",
            "All packages are up to date."
          ]
        ]
      },
      {
        "say": "System par installed package check karne ke liye `dpkg -l | grep <name>` use hota hai. `ii` status ka matlab installed and configured.",
        "code": [
          2,
          3
        ],
        "ops": [
          [
            "term",
            "term",
            "oracle@prod-db01:~$ dpkg -l | grep -i nginx"
          ],
          [
            "out",
            "term",
            "ii  nginx                          1.24.0-1ubuntu1  amd64  small, powerful, scalable web server"
          ],
          [
            "ok",
            "pkg"
          ]
        ]
      },
      {
        "say": "Agar package ka exact naam pata na ho, toh `apt search <keyword>` se repository search kar sakte ho.",
        "code": [
          4,
          5
        ],
        "ops": [
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
        ]
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
        ]
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
    ]
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
        "daemon",
        "pill",
        60,
        60,
        160,
        50,
        "crond Daemon\nChecks every min",
        {
          "tone": "accent"
        }
      ],
      [
        "tab",
        "doc",
        290,
        50,
        200,
        75,
        "crontab\n0 2 * * * backup.sh",
        {
          "tone": "file"
        }
      ],
      [
        "script",
        "box",
        560,
        50,
        180,
        75,
        "backup_db.sh\nNightly Execution",
        {
          "tone": "proc"
        }
      ],
      [
        "log",
        "doc",
        800,
        50,
        120,
        75,
        "cron.log\n>> output",
        {
          "tone": "ok"
        }
      ],
      [
        "term",
        "term",
        30,
        200,
        890,
        310,
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
            "tab",
            "script",
            "log",
            "term"
          ],
          [
            "link",
            "daemon",
            "tab",
            {
              "tone": "accent"
            }
          ],
          [
            "link",
            "tab",
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
              "tone": "ok"
            }
          ]
        ]
      },
      {
        "say": "Active jobs dekhne ke liye `crontab -l` chalao. Yahan har schedule 5 fields se shuru hota hai.",
        "code": [
          0,
          1
        ],
        "ops": [
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
        ]
      },
      {
        "say": "5 Stars ka structure yaad rakho: 1=Minute (0-59), 2=Hour (0-23), 3=Day (1-31), 4=Month (1-12), 5=Weekday (0-6, 0=Sunday). `0 2 * * *` matlab roz raat 2:00 AM.",
        "code": [
          2,
          3
        ],
        "ops": [
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
        ]
      },
      {
        "say": "Golden Production Rule: Cron job ke aakhir mein hamesha `>> /path/file.log 2>&1` lagao! Agar redirect nahi kiya, toh cron output kho jayega aur failure ka pata nahi chalega.",
        "code": [
          4,
          5
        ],
        "ops": [
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
            "tab"
          ]
        ]
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
            "out",
            "term",
            "Oct 29 09:00:01 prod-db01 CRON[1200]: (root) CMD (/usr/lib/x86_64-linux-gnu/sa/sa1 1 1)",
            "Oct 29 10:00:01 prod-db01 CRON[1350]: (oracle) CMD (/home/oracle/scripts/backup_db.sh)"
          ],
          [
            "ok",
            "script"
          ]
        ]
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
    ]
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
        50,
        60,
        180,
        80,
        "~/.bashrc\nexport ORACLE_SID=FREE\nexport PATH=$PATH:...",
        {
          "tone": "file"
        }
      ],
      [
        "source",
        "pill",
        290,
        75,
        150,
        48,
        "source ~/.bashrc\nInstant Reload",
        {
          "tone": "proc"
        }
      ],
      [
        "env",
        "box",
        500,
        60,
        180,
        80,
        "Active Shell Env\n$PATH\n$ORACLE_HOME",
        {
          "tone": "accent"
        }
      ],
      [
        "app",
        "box",
        740,
        60,
        170,
        80,
        "sqlplus / python\nFinds commands",
        {
          "tone": "ok"
        }
      ],
      [
        "term",
        "term",
        30,
        210,
        890,
        300,
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
            "env",
            "app",
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
            "env",
            {
              "tone": "proc"
            }
          ],
          [
            "link",
            "env",
            "app",
            {
              "tone": "ok"
            }
          ]
        ]
      },
      {
        "say": "`echo $PATH` chalao: yeh colon `:` separated folders hain jaise `/usr/bin:/bin:/u01/app/oracle/product/23ai/dbhomeFree/bin`.",
        "code": [
          0,
          1
        ],
        "ops": [
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
        ]
      },
      {
        "say": "Oracle DBA ke liye `$ORACLE_HOME` aur `$ORACLE_SID` set hona compulsory hai, warna `sqlplus / as sysdba` chalane par `ORA-12162` error aayega.",
        "code": [
          2,
          3
        ],
        "ops": [
          [
            "term",
            "term",
            "oracle@prod-db01:~$ echo \"ORACLE_HOME: $ORACLE_HOME | ORACLE_SID: $ORACLE_SID\""
          ],
          [
            "out",
            "term",
            "ORACLE_HOME: /u01/app/oracle/product/23ai/dbhomeFree | ORACLE_SID: FREE"
          ],
          [
            "ok",
            "env"
          ]
        ]
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
            "term",
            "term",
            "oracle@prod-db01:~$ export APP_ENV=production"
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
        ]
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
            "ok",
            "app"
          ]
        ]
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
    ]
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
        60,
        60,
        160,
        60,
        "Run Command\n(ls, backup.sh)",
        {
          "tone": "accent"
        }
      ],
      [
        "exitcode",
        "pill",
        280,
        65,
        140,
        50,
        "$? Exit Code\n0 or Non-Zero",
        {
          "tone": "proc"
        }
      ],
      [
        "branch",
        "box",
        480,
        60,
        170,
        60,
        "if [ $? -eq 0 ]\nConditional Check",
        {
          "tone": "file"
        }
      ],
      [
        "pass",
        "box",
        720,
        30,
        180,
        50,
        "Success: echo \"OK\"",
        {
          "tone": "ok"
        }
      ],
      [
        "fail",
        "box",
        720,
        100,
        180,
        50,
        "Failure: exit 1 (Alert)",
        {
          "tone": "danger"
        }
      ],
      [
        "term",
        "term",
        30,
        210,
        890,
        300,
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
            "exitcode",
            "branch",
            "pass",
            "fail",
            "term"
          ],
          [
            "link",
            "cmd",
            "exitcode",
            {
              "tone": "accent"
            }
          ],
          [
            "link",
            "exitcode",
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
              "tone": "ok"
            }
          ],
          [
            "link",
            "branch",
            "fail",
            {
              "tone": "danger"
            }
          ]
        ]
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
            "out",
            "term",
            "Exit code: 0"
          ],
          [
            "ok",
            "pass"
          ]
        ]
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
            "out",
            "term",
            "Exit code: 2"
          ],
          [
            "danger",
            "fail"
          ]
        ]
      },
      {
        "say": "File checking condition: `[ -f <file> ]` check karta hai file maujood hai ya nahi. `if ... then ... else ... fi` se flow control hota hai.",
        "code": [
          6,
          7
        ],
        "ops": [
          [
            "term",
            "term",
            "oracle@prod-db01:~$ if [ -f /var/log/syslog ]; then echo \"File exists!\"; else echo \"Missing!\"; fi"
          ],
          [
            "out",
            "term",
            "File exists!"
          ]
        ]
      },
      {
        "say": "`scripts/healthcheck.sh` ko inspect karo: dekho kaise exit code aur if-else se automated status reporting banayi gayi hai.",
        "code": [
          8,
          9
        ],
        "ops": [
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
          ]
        ]
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
    ]
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
        50,
        60,
        200,
        80,
        "audit_server.sh\nProduction Script",
        {
          "tone": "file"
        }
      ],
      [
        "fn1",
        "box",
        310,
        45,
        170,
        50,
        "check_disk()\ndf -h threshold",
        {
          "tone": "accent"
        }
      ],
      [
        "fn2",
        "box",
        310,
        105,
        170,
        50,
        "check_service()\nsystemctl is-active",
        {
          "tone": "proc"
        }
      ],
      [
        "fn3",
        "box",
        310,
        165,
        170,
        50,
        "check_ports()\nss -tulpn listener",
        {
          "tone": "accent"
        }
      ],
      [
        "report",
        "box",
        560,
        80,
        200,
        80,
        "Formatted Report\n[OK] Disk healthy\n[OK] Nginx running",
        {
          "tone": "ok"
        }
      ],
      [
        "term",
        "term",
        30,
        245,
        890,
        265,
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
            "fn1",
            "fn2",
            "fn3",
            "report",
            "term"
          ],
          [
            "link",
            "script",
            "fn1",
            {
              "tone": "file"
            }
          ],
          [
            "link",
            "script",
            "fn2",
            {
              "tone": "file"
            }
          ],
          [
            "link",
            "script",
            "fn3",
            {
              "tone": "file"
            }
          ],
          [
            "link",
            "fn2",
            "report",
            {
              "tone": "ok"
            }
          ]
        ]
      },
      {
        "say": "Services check karne ke liye ek line ka for loop: `for srv in nginx sshd; do ... done`. Dono services ka health status ek second mein samne aa gaya.",
        "code": [
          0,
          1
        ],
        "ops": [
          [
            "term",
            "term",
            "oracle@prod-db01:~$ for srv in nginx sshd; do systemctl is-active --quiet $srv && echo \"[OK] $srv active\" || echo \"[FAIL] $srv down\"; done"
          ],
          [
            "out",
            "term",
            "[OK] nginx active",
            "[OK] sshd active"
          ],
          [
            "ok",
            "fn2"
          ]
        ]
      },
      {
        "say": "`scripts/backup_db.sh` inspect karo. Dekho kaise timestamp variable `$(date +%Y%m%d_%H%M%S)` aur logging functions banaye gaye hain.",
        "code": [
          2,
          3
        ],
        "ops": [
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
          ],
          [
            "ok",
            "script"
          ]
        ]
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
            "out",
            "term",
            "=== [START] Database Backup at 20261029_110000 ===",
            "Exporting schemas and validating tablespace free space...",
            "=== [DONE] Backup finished successfully ==="
          ],
          [
            "ok",
            "report"
          ]
        ]
      },
      {
        "say": "Files ko line-by-line iterate karne ke liye `while read line; do ... done < file.txt` sabse safe tareeqa hai (spaces aur special characters break nahi hote).",
        "code": [
          6,
          7
        ],
        "ops": [
          [
            "term",
            "term",
            "oracle@prod-db01:~$ while read line; do echo \"Task: $line\"; done < todo.txt | head -n 3"
          ],
          [
            "out",
            "term",
            "Task: backup database",
            "Task: check disk",
            "Task: rotate logs"
          ]
        ]
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
    ]
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
        "pill",
        50,
        60,
        160,
        50,
        "oracle user\nHigh concurrency",
        {
          "tone": "accent"
        }
      ],
      [
        "limits",
        "doc",
        280,
        50,
        200,
        75,
        "/etc/security/limits.conf\noracle soft nofile 65536\noracle hard nofile 65536",
        {
          "tone": "file"
        }
      ],
      [
        "sysctl",
        "box",
        540,
        50,
        190,
        75,
        "sysctl.conf (Kernel)\nvm.swappiness=10\nfs.file-max=6815744",
        {
          "tone": "proc"
        }
      ],
      [
        "engine",
        "disk",
        780,
        50,
        140,
        75,
        "Linux Kernel\nOptimized for DB",
        {
          "tone": "ok"
        }
      ],
      [
        "term",
        "term",
        30,
        200,
        890,
        310,
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
            "engine",
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
              "tone": "file"
            }
          ],
          [
            "link",
            "sysctl",
            "engine",
            {
              "tone": "ok"
            }
          ]
        ]
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
        ]
      },
      {
        "say": "`/etc/security/limits.conf` mein `oracle soft nofile 65536` aur `oracle hard nofile 65536` define kiya jata hai taaki login hote hi limits auto-set hon.",
        "code": [
          4,
          5
        ],
        "ops": [
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
        ]
      },
      {
        "say": "Database performance ke liye `vm.swappiness` bohot ahem hai. Default `60` hota hai jisse kernel jaldi swap karne lagta hai. DB ke liye ise `10` ya `1` rakha jata hai.",
        "code": [
          6,
          7
        ],
        "ops": [
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
        ]
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
            "engine"
          ]
        ]
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
    ]
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
        50,
        60,
        200,
        80,
        "/etc/ssh/sshd_config\nPermitRootLogin no\nPasswordAuth no",
        {
          "tone": "danger"
        }
      ],
      [
        "harden",
        "box",
        310,
        65,
        170,
        70,
        "sshd Hardening\nRestart sshd",
        {
          "tone": "accent"
        }
      ],
      [
        "authlog",
        "doc",
        550,
        60,
        190,
        80,
        "/var/log/auth.log\nSecurity Audit Trail",
        {
          "tone": "file"
        }
      ],
      [
        "safe",
        "disk",
        800,
        60,
        120,
        80,
        "CIS Compliant\nAudited Host",
        {
          "tone": "ok"
        }
      ],
      [
        "term",
        "term",
        30,
        210,
        890,
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
            "harden",
            "authlog",
            "safe",
            "term"
          ],
          [
            "link",
            "sshd",
            "harden",
            {
              "tone": "danger"
            }
          ],
          [
            "link",
            "harden",
            "authlog",
            {
              "tone": "file"
            }
          ],
          [
            "link",
            "authlog",
            "safe",
            {
              "tone": "ok"
            }
          ]
        ]
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
            "out",
            "term",
            "PermitRootLogin no",
            "PasswordAuthentication no"
          ],
          [
            "ok",
            "sshd"
          ]
        ]
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
            "out",
            "term",
            "Oct 29 09:12:00 prod-db01 sshd[901]: Failed password for invalid user admin from 203.0.113.9 port 44120 ssh2",
            "Oct 29 09:12:02 prod-db01 sshd[904]: Failed password for invalid user test from 203.0.113.9 port 44122 ssh2"
          ],
          [
            "danger",
            "authlog"
          ]
        ]
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
            "out",
            "term",
            "Oct 29 08:30:15 prod-db01 sudo:   oracle : TTY=pts/0 ; PWD=/home/oracle ; USER=root ; COMMAND=/bin/systemctl restart nginx",
            "Oct 29 09:45:00 prod-db01 sudo:   oracle : TTY=pts/0 ; PWD=/home/oracle ; USER=root ; COMMAND=/usr/sbin/ufw status"
          ]
        ]
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
            "out",
            "term",
            "# No dangerous 777 files found - Clean!"
          ],
          [
            "ok",
            "safe"
          ]
        ]
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
    ]
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
        "p1",
        "pill",
        50,
        60,
        160,
        50,
        "P1 ALERT\nPayAPI Down!",
        {
          "tone": "danger"
        }
      ],
      [
        "triage",
        "box",
        270,
        50,
        180,
        75,
        "Step 1 & 2: Triage\nuptime & df -h",
        {
          "tone": "proc"
        }
      ],
      [
        "invest",
        "box",
        510,
        50,
        190,
        75,
        "Step 3: Logs\njournalctl -u payapi",
        {
          "tone": "accent"
        }
      ],
      [
        "fix",
        "box",
        760,
        50,
        160,
        75,
        "Step 4 & 5: Fix\nsystemctl start payapi\ncurl health 200 OK",
        {
          "tone": "ok"
        }
      ],
      [
        "term",
        "term",
        30,
        200,
        890,
        310,
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
            "p1",
            "triage",
            "invest",
            "fix",
            "term"
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
        ]
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
        ]
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
          ],
          [
            "danger",
            "invest"
          ]
        ]
      },
      {
        "say": "Root Cause mil gaya: Database listener down hua tha jo ab wapas aa chuka hai, par service restart nahi hui thi. Ab service start karo: `sudo systemctl start payapi`.",
        "code": [
          8,
          9
        ],
        "ops": [
          [
            "term",
            "term",
            "oracle@prod-db01:~$ sudo systemctl start payapi"
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
          ],
          [
            "ok",
            "invest"
          ]
        ]
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
            "out",
            "term",
            "{\"status\":\"UP\",\"service\":\"payapi\",\"database\":\"connected\",\"timestamp\":\"2026-10-29T11:15:32Z\"}"
          ],
          [
            "ok",
            "fix"
          ],
          [
            "ok",
            "p1"
          ]
        ]
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
    ]
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
