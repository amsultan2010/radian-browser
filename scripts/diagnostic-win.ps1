# Diagnostic d'un processus principal figé sous Windows (appelé par scripts/dev.js
# quand le battement des essais s'arrête) : processus, fils d'exécution, fenêtres
# de premier niveau (une boîte modale restée ouverte s'y voit), capture de
# l'écran, puis piles d'appels natives si le débogueur du SDK est présent.
param([int]$ProcessId, [string]$Out = '')
$ErrorActionPreference = 'Continue'

Write-Host "--- Processus"
Get-CimInstance Win32_Process | Where-Object { $_.Name -match 'electron|Orbe|WerFault|consent|rundll32|dllhost' } | ForEach-Object {
  $cmd = ($_.CommandLine -replace '\s+', ' ')
  if ($cmd.Length -gt 170) { $cmd = $cmd.Substring(0, 170) }
  "{0,6} (parent {1,6}) {2} {3}" -f $_.ProcessId, $_.ParentProcessId, $_.Name, $cmd
}

Write-Host "--- Fils d'exécution du processus principal ($ProcessId)"
try {
  $p = Get-Process -Id $ProcessId
  "répond aux messages : $($p.Responding) ; fenêtre principale : « $($p.MainWindowTitle) »"
  $p.Threads | Sort-Object StartTime | Select-Object -First 12 | ForEach-Object { "  fil {0,6} {1} {2}" -f $_.Id, $_.ThreadState, $(if ($_.ThreadState -eq 'Wait') { $_.WaitReason } else { '' }) }
} catch { "illisible : $_" }

Write-Host "--- Fenêtres de premier niveau visibles (toutes applications)"
Add-Type @"
using System; using System.Text; using System.Runtime.InteropServices; using System.Collections.Generic;
public class OrbeWin {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsWindowEnabled(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsHungAppWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr h, uint cmd);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  public static List<string> List() {
    var res = new List<string>();
    IntPtr fg = GetForegroundWindow();
    EnumWindows((h, l) => {
      if (!IsWindowVisible(h)) return true;
      uint pid; uint tid = GetWindowThreadProcessId(h, out pid);
      var t = new StringBuilder(256); GetWindowText(h, t, 256);
      var c = new StringBuilder(256); GetClassName(h, c, 256);
      IntPtr owner = GetWindow(h, 4);
      res.Add(String.Format("  pid {0,6} fil {1,6} classe {2} « {3} »{4}{5}{6}{7}", pid, tid, c, t,
        IsWindowEnabled(h) ? "" : " DESACTIVEE", IsHungAppWindow(h) ? " FIGEE" : "", owner != IntPtr.Zero ? " (possedee par une autre fenetre)" : "", h == fg ? " AU PREMIER PLAN" : ""));
      return true;
    }, IntPtr.Zero);
    return res;
  }
}
"@
[OrbeWin]::List() | ForEach-Object { $_ }
"(classe #32770 = boîte de dialogue du système)"

if ($Out) {
  try {
    Add-Type -AssemblyName System.Windows.Forms, System.Drawing
    $b = [System.Windows.Forms.SystemInformation]::VirtualScreen
    $bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.CopyFromScreen($b.Left, $b.Top, 0, 0, $bmp.Size)
    $file = Join-Path $Out 'processus-fige-ecran.png'
    $bmp.Save($file, [System.Drawing.Imaging.ImageFormat]::Png)
    Write-Host "--- Capture de l'écran : $file"
  } catch { Write-Host "--- Capture de l'écran impossible : $_" }
}

$cdb = @("${env:ProgramFiles(x86)}\Windows Kits\10\Debuggers\x64\cdb.exe", "${env:ProgramFiles}\Windows Kits\10\Debuggers\x64\cdb.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $cdb) { Write-Host "--- Piles d'appels : débogueur (cdb.exe) absent de cette machine"; exit 0 }
$sym = Join-Path $env:TEMP 'orbe-symboles'
function Stacks([string]$path, [int]$seconds, [string]$title) {
  Write-Host "--- $title"
  $log = Join-Path $env:TEMP ("orbe-cdb-" + [guid]::NewGuid().ToString('N') + ".txt")
  $proc = Start-Process -FilePath $cdb -ArgumentList @('-pv', '-p', "$ProcessId", '-y', "`"$path`"", '-c', '"~0 k 70; ~* k 14; qd"') -RedirectStandardOutput $log -NoNewWindow -PassThru
  if (-not $proc.WaitForExit($seconds * 1000)) { try { $proc.Kill() } catch {}; Write-Host "(débogueur arrêté après $seconds s)" }
  if (Test-Path $log) { Get-Content $log | Where-Object { $_ -notmatch '^(ModLoad|\*\*\* (WARNING|ERROR): (Unable to verify|Symbol file could not be found))' } | Select-Object -First 420 }
}
Stacks "srv*$sym*https://msdl.microsoft.com/download/symbols" 120 "Piles d'appels (symboles de Windows seulement ; fil 0 = fil principal)"
if ($env:ORBE_DIAG_SYMBOLS -eq '1') {
  Stacks "srv*$sym*https://msdl.microsoft.com/download/symbols;srv*$sym*https://symbols.electronjs.org" 420 "Piles d'appels avec les symboles d'Electron (téléchargement long)"
}
