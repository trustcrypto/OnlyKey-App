; NSIS packaging/install script
; Docs: http://nsis.sourceforge.net/Docs/Contents.html

;--------------------------------
;Include Modern UI

  !include "MUI2.nsh"

;--------------------------------
;General

  ;Name and file

!define dest "{{dest}}"
!define src "{{src}}"
!define name "{{name}}"
!define productName "{{productName}}"
!define version "{{version}}"
!define versionQuad "{{versionQuad}}"
!define companyName "{{companyName}}"
!define icon "{{icon}}"
!define setupIcon "{{setupIcon}}"
!define banner "{{banner}}"

!define exec "nw.exe"

; 64-bit ends up at HKEY_LOCAL_MACHINE\SOFTWARE\WOW6432Node\OnlyKey
!define regkey "Software\${name}"
; 64-bit ends up at HKEY_LOCAL_MACHINE\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\OnlyKey
!define uninstkey "Software\Microsoft\Windows\CurrentVersion\Uninstall\${name}"

!define uninstaller "uninstall.exe"

SetCompressor lzma

; Program Files writes need an elevated token. Without this, NSIS picks a
; default manifest and a non-elevated start fails instead of showing UAC.
RequestExecutionLevel admin

Name "${name}"
Icon "${icon}"
OutFile "${dest}"
InstallDir "$PROGRAMFILES\${name}"
InstallDirRegKey HKLM "${regkey}" ""

CRCCheck on
SilentInstall normal

ShowInstDetails hide
AutoCloseWindow false
WindowIcon off

Caption "${productName} ${version} Setup"
; Don't add sub-captions to title bar
SubCaption 3 " "
SubCaption 4 " "

;--------------------------------
;Interface Settings

  !define MUI_ICON "${setupIcon}"
  !define MUI_UNICON "${setupIcon}"
  !define MUI_HEADERIMAGE
  !define MUI_HEADERIMAGE_BITMAP "${banner}"
  !define MUI_HEADERIMAGE_UNBITMAP "${banner}"
  !define MUI_ABORTWARNING

;--------------------------------
;Pages

  !insertmacro MUI_PAGE_DIRECTORY
  !insertmacro MUI_PAGE_INSTFILES
  !insertmacro MUI_UNPAGE_CONFIRM
  
;--------------------------------
;Languages
 
  !insertmacro MUI_LANGUAGE "English"

VIProductVersion ${versionQuad}
VIAddVersionKey /LANG=${LANG_ENGLISH} ProductName "${productName}"
VIAddVersionKey /LANG=${LANG_ENGLISH} CompanyName "${companyName}"
VIAddVersionKey /LANG=${LANG_ENGLISH} LegalCopyright "Copyright (c) ${companyName}"
VIAddVersionKey /LANG=${LANG_ENGLISH} FileVersion "${version}"
VIAddVersionKey /LANG=${LANG_ENGLISH} ProductVersion "${version}"
VIAddVersionKey /LANG=${LANG_ENGLISH} FileDescription "${productName} ${version} Setup"

;--------------------------------
; Close a running install before files are copied.
;
; Close-to-tray is the default, so closing the window leaves nw.exe running.
; That process keeps Chromium DLLs such as d3dcompiler_47.dll mapped, and
; File then stops with Abort / Retry / Ignore. prepare-install.ps1 ends those
; processes and renames any file that is still mapped. SetOverwrite try is the
; backstop: a file that is still open is skipped instead of popping that dialog.

!macro PrepareInstallDirectory UN
Function ${UN}RunInstallScript
    Push $0
    Push $1

    InitPluginsDir
    StrCpy $1 "$OUTDIR"
    SetOutPath "$PLUGINSDIR"
    File "/oname=prepare-install.ps1" "{{prepareScript}}"
    ${If} $1 != ""
        SetOutPath "$1"
    ${EndIf}

    System::Call 'kernel32::SetEnvironmentVariable(t "ONLYKEY_INSTALL_DIR", t "$INSTDIR") i.r0'
    StrCpy $0 "$SYSDIR\WindowsPowerShell\v1.0\powershell.exe"
    ${IfNot} ${FileExists} "$0"
        StrCpy $0 "powershell.exe"
    ${EndIf}
    nsExec::ExecToLog /TIMEOUT=60000 '"$0" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\prepare-install.ps1"'
    Pop $0
    ${If} $0 != 0
        DetailPrint "Could not finish cleaning the previous install (preparing the folder returned $0). Setup will continue."
    ${EndIf}
    System::Call 'kernel32::SetEnvironmentVariable(t "ONLYKEY_INSTALL_DIR", p 0) i.r0'

    Pop $1
    Pop $0
FunctionEnd

Function ${UN}PrepareInstallDirectory
    DetailPrint "Closing OnlyKey and removing the previous install..."
    System::Call 'kernel32::SetEnvironmentVariable(t "ONLYKEY_REMOVE_PENDING", p 0) i.r0'
    Call ${UN}RunInstallScript
FunctionEnd

Function ${UN}SweepPendingFiles
    DetailPrint "Removing files still held from the previous install..."
    System::Call 'kernel32::SetEnvironmentVariable(t "ONLYKEY_REMOVE_PENDING", t "1") i.r0'
    Call ${UN}RunInstallScript
    System::Call 'kernel32::SetEnvironmentVariable(t "ONLYKEY_REMOVE_PENDING", p 0) i.r0'
FunctionEnd
!macroend

!insertmacro PrepareInstallDirectory ""
!insertmacro PrepareInstallDirectory "un."

;--------------------------------
;Installer Sections

; Installation declarations
Section "Install"

    Call PrepareInstallDirectory

    WriteRegStr HKLM "${regkey}" "Install_Dir" "$INSTDIR"
    WriteRegStr HKLM "${regkey}" "DefaultIcon" "$INSTDIR\icon.ico"
    WriteRegStr HKLM "${uninstkey}" "DisplayName" "${name}"
    WriteRegStr HKLM "${uninstkey}" "DisplayIcon" "$INSTDIR\icon.ico"
    WriteRegStr HKLM "${uninstkey}" "UninstallString" "$INSTDIR\${uninstaller}"
    
    ; Second pass over anything the prepare script could not delete.
    RMDir /r "$INSTDIR"
    
    SetOutPath $INSTDIR
    
    ; Include all files from /build directory. try: never stop on a file
    ; that is still open. Locked files were renamed above, so this writes
    ; the new copy under the original name.
    ClearErrors
    SetOverwrite try
    File /r "${src}\*"
    ${If} ${Errors}
        DetailPrint "Some files are still in use. Quit OnlyKey from the tray and run setup again if the new version does not start."
    ${EndIf}
    SetOverwrite on
    
    ; Create start menu shortcut
    CreateShortCut "$SMPROGRAMS\${name}.lnk" "$INSTDIR\${exec}" "" "$INSTDIR\icon.ico"

    ; Migrate the old auto-launch value named "nw" (Task Manager shows that name,
    ; and a disabled StartupApproved flag keeps it from running). A disabled
    ; OnlyKey value is left alone.
    ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "OnlyKey"
    ${If} $0 == ""
        ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "nw"
        ${If} $0 != ""
            StrCpy $1 "$INSTDIR\nw.exe"
            Push $0
            Push $1
            Call StrContains
            Pop $2
            ${If} $2 == "1"
                WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "OnlyKey" "$\"$INSTDIR\nw.exe$\" $\"$INSTDIR$\" --hidden --onlykey-autostart"
                WriteRegBin HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "OnlyKey" 020000000000000000000000
                DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "nw"
                DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "nw"
            ${EndIf}
        ${EndIf}
    ${EndIf}
    
    WriteUninstaller "${uninstaller}"

    Call SweepPendingFiles

SectionEnd

;--------------------------------
;Uninstaller Section

; --------------------------------
; Uninstaller
; --------------------------------

ShowUninstDetails hide

; $0 = 1 when the string contains the substring.
; Push string, push substring, Call StrContains, Pop result.
Function StrContains
    Exch $R0
    Exch
    Exch $R1
    Push $R2
    Push $R3
    Push $R4
    StrLen $R2 $R0
    StrCpy $R3 0
    inst_str_loop:
        StrCpy $R4 $R1 $R2 $R3
        StrCmp $R4 "" inst_str_notfound
        StrCmp $R4 $R0 inst_str_found
        IntOp $R3 $R3 + 1
        Goto inst_str_loop
    inst_str_found:
        StrCpy $R0 1
        Goto inst_str_done
    inst_str_notfound:
        StrCpy $R0 0
    inst_str_done:
        Pop $R4
        Pop $R3
        Pop $R2
        Pop $R1
        Exch $R0
FunctionEnd

; Push string, push substring, Call un.StrContains, Pop result.
Function un.StrContains
    Exch $R0
    Exch
    Exch $R1
    Push $R2
    Push $R3
    Push $R4
    StrLen $R2 $R0
    StrCpy $R3 0
    un_str_loop:
        StrCpy $R4 $R1 $R2 $R3
        StrCmp $R4 "" un_str_notfound
        StrCmp $R4 $R0 un_str_found
        IntOp $R3 $R3 + 1
        Goto un_str_loop
    un_str_found:
        StrCpy $R0 1
        Goto un_str_done
    un_str_notfound:
        StrCpy $R0 0
    un_str_done:
        Pop $R4
        Pop $R3
        Pop $R2
        Pop $R1
        Exch $R0
FunctionEnd

UninstallCaption "Uninstall ${productName}"
UninstallText "Follow the prompts to remove ${productName} from this computer."
UninstallIcon "${icon}"

UninstPage custom un.confirm un.confirmOnLeave
UninstPage instfiles

Var RemoveAppDataCheckbox
Var RemoveAppDataCheckbox_State

; Custom uninstall confirm page
Function un.confirm

    nsDialogs::Create 1018
    
    ${NSD_CreateLabel} 1u 1u 100% 24u "To finish removing ${productName} from your computer, press the [Uninstall] button below."

    ${NSD_CreateCheckbox} 1u 35u 100% 10u "Also remove my ${productName} personal settings"
    Pop $RemoveAppDataCheckbox

    nsDialogs::Show

FunctionEnd

Function un.confirmOnLeave
    
    ; Save checkbox state on page leave
    ${NSD_GetState} $RemoveAppDataCheckbox $RemoveAppDataCheckbox_State

FunctionEnd

; Uninstall declarations
Section "Uninstall"

    Call un.PrepareInstallDirectory

    DeleteRegKey HKLM "${uninstkey}"
    DeleteRegKey HKLM "${regkey}"

    ; Per-user login entry. Also drop the legacy value auto-launch named after nw.exe
    ; when it points at this install.
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "OnlyKey"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "OnlyKey"
    ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "nw"
    ${If} $0 != ""
        StrCpy $1 "$INSTDIR\nw.exe"
        Push $0
        Push $1
        Call un.StrContains
        Pop $2
        ${If} $2 == "1"
            DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "nw"
            DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "nw"
        ${EndIf}
    ${EndIf}
    
    Delete "$SMPROGRAMS\${name}.lnk"
    
    ; Remove whole directory from Program Files
    RMDir /r "$INSTDIR"
    Call un.SweepPendingFiles

    ; Remove also appData directory generated by your app if user checked this option
    ${If} $RemoveAppDataCheckbox_State == ${BST_CHECKED}
        RMDir /r "$LOCALAPPDATA\${name}"
    ${EndIf}
    
SectionEnd
