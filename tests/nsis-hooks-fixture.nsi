; Compile-only fixture: executes no installer and touches no live registration.
Unicode true
!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "nsDialogs.nsh"
!define MAINBINARYNAME "oryvia"
!define UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\Oryvia"
Var MultiUser.InstallMode
!include "..\installer\build\installer.nsh"
Name "Oryvia hooks fixture"
OutFile "${ORYVIA_FIXTURE_OUTPUT}"
RequestExecutionLevel user
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"
Section
  !insertmacro NSIS_HOOK_PREINSTALL
  !insertmacro NSIS_HOOK_POSTINSTALL
SectionEnd
