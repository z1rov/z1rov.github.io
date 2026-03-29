---
TitleSEO:    "Network Scanning — Nmap, Fscan & Masscan Reference | zirov"
TitlePost:   "Network Scanning"
Author:      "zirov"
Description: "Guía práctica de network scanning con Nmap, Masscan y Fscan para descubrir hosts, escanear puertos y enumerar servicios en pentesting y CTF."
Keywords:    "Network, Recon, Enumeration, Port-Scanning, Nmap, Masscan, Fscan, Pentesting, CTF, Cheatsheet, Infrastructure, TCP, UDP, Discovery, Network-Security"
URL:         "https://zirov.xyz/notes/network-scanning.html"
URL_IMAGES:  "https://raw.githubusercontent.com/zirov/images/refs/heads/main/notes/network-scanning/"
Date:        "2026-03-28"
Tags: "Network, Recon, Enumeration, Port-Scanning, Nmap, Masscan, Fscan, Pentesting, CTF, Cheatsheet, Infrastructure, TCP, UDP, Discovery, Network-Security"
Section:     "notes"
Subsection:  "Network"
Lang:        "en"
main_img:    "network-scanning"
Permalink:   "/notes/network-scanning.html"
Pick:        0
---

## Nmap, Fscan & Masscan for Recon and Enumeration

**Category:** `Cheatsheet` 
**Area:** `Network`  
**Author:** Zirov  
**Date:** 2026-03-28  

> *Cómo hacer un barrido de red eficiente usando Nmap para enumeración precisa, Masscan para velocidad, y Fscan para redes internas.*

## Context

Nota escrita después de varios CTFs y labs donde la fase de reconocimiento de red se hacía lenta o incompleta por depender de una sola herramienta. La combinación de las tres cubre los diferentes escenarios: redes grandes, enumeración detallada, y pivoting interno. Cada herramienta tiene su momento.

## Core Concept

El escaneo de red tiene dos fases distintas: **descubrimiento** (¿qué hosts están vivos y qué puertos abiertos tienen?) y **enumeración** (¿qué está corriendo exactamente en esos puertos?). Mezclar ambas en un solo comando suele ser ineficiente. El flujo general es: Masscan para el barrido rápido inicial → Nmap para profundizar → Fscan cuando ya estás dentro de una red interna y necesitas rapidez sin complicarte.

## How It Works

### Mechanism

Masscan implementa su propio stack TCP/IP sin pasar por el kernel, lo que le permite enviar paquetes a velocidades brutales sin esperar confirmaciones del OS. El tradeoff: puede ser menos preciso en redes con pérdida de paquetes. Nmap con `-sC` ejecuta scripts NSE que hacen handshakes reales con los servicios — más lento, mucho más informativo. Fscan combina port scan + detección de servicios + checks básicos de vulns en un solo binario, ideal post-pivoting cuando no puedes traer muchas herramientas.

```bash
# Flujo típico: masscan descubre, nmap enumera
sudo masscan -p1-65535 $IP --rate=10000 -oG masscanAll
# → extraer puertos abiertos
grep "open" masscanAll | awk '{print $5}' | cut -d'/' -f1 | tr '\n' ','
# → profundizar con nmap sobre esos puertos
sudo nmap -sCV -p <PORTS> -Pn -n -T4 $IP -oN targeted
```

## Practical Examples

---

## NMAP

### TCP Full Port Scan

```bash
sudo nmap -p- -sS -Pn -n --open --min-rate 6500 --max-retries 1 --initial-rtt-timeout 100ms --max-rtt-timeout 300ms -T4 $IP -oG allPorts
```

> SYN scan sigiloso sobre todos los puertos. `-Pn` omite ping, `-n` desactiva DNS, `--min-rate 6500` lo hace rápido. Ideal para el primer reconocimiento.

### TCP Top Ports

```bash
sudo nmap --top-ports 200 -sS -Pn -n --open -T4 $IP -oG topPorts
```

> Escanea solo los 200 puertos más comunes. Útil cuando necesitas resultados en segundos sin esperar un full scan.

### TCP con Detección de Versiones y Scripts

```bash
sudo nmap -sCV -p <PORTS> -Pn -n -T4 $IP -oN targeted
```

> Lanza scripts NSE por defecto (`-sC`) y detecta versiones de servicios (`-sV`). Úsalo sobre los puertos abiertos del paso anterior.

### TCP Detección de OS

```bash
sudo nmap -O -sS -Pn -n -p <PORTS> $IP -oN osDetect
```

> Intenta identificar el sistema operativo mediante fingerprinting TCP/IP. Requiere privilegios de root.

### TCP Vulnerability Scan (NSE Scripts)

```bash
sudo nmap --script vuln -p <PORTS> -Pn -n $IP -oN vulnScan
```

> Ejecuta scripts NSE de la categoría `vuln` para detectar vulnerabilidades conocidas en los servicios. Puede generar ruido.

### UDP Top 1000 Ports

```bash
sudo nmap -sU --top-ports 1000 --min-rate 1000 $IP -oG udpPorts
```

> Escaneo UDP de los 1000 puertos más frecuentes. UDP es lento por naturaleza, `--min-rate` lo acelera un poco.

### UDP Puertos Críticos

```bash
sudo nmap -sU -p 53,67,68,69,111,123,137,138,161,162,500,514,1900 -Pn $IP -oN udpCritical
```

> Apunta directamente a los puertos UDP más relevantes en pentesting: DNS, DHCP, TFTP, NFS, NTP, NetBIOS, SNMP, IKE, Syslog, SSDP.

### SNMP Enumeration (UDP 161)

```bash
sudo nmap -sU -p 161 --script snmp-info,snmp-sysdescr,snmp-processes,snmp-interfaces $IP -oN snmpEnum
```

> Extrae info del sistema, procesos corriendo e interfaces de red vía SNMP. Si la community string es `public`, jackpot.

---

## FSCAN

### TCP Full Port Scan

```bash
fscan -h $IP -p 1-65535 -o allPorts
```

> Escanea todos los puertos TCP del objetivo. Más rápido que nmap por defecto, útil para un primer barrido agresivo.

### TCP Top Ports

```bash
fscan -h $IP -o topPorts
```

> Usa los puertos por defecto de fscan (más comunes). Rápido para reconocimiento inicial sin especificar rango.

### TCP con Detección de Servicios

```bash
fscan -h $IP -p 1-65535 -sV -o serviceScan
```

> Además del scan de puertos, intenta identificar el servicio y versión corriendo en cada puerto abierto.

### UDP SNMP (Puerto 161)

```bash
fscan -h $IP -p 161 -o snmpScan
```

> Verifica si SNMP está activo. Si responde, puede revelar información crítica del sistema sin autenticación.

### Internal Network Discovery (CIDR)

```bash
fscan -h 10.10.10.0/24 -o networkScan
```

> Descubre hosts activos y puertos abiertos en toda la subred. Imprescindible en pivoting para mapear la red interna.

### Internal Network con Rango de Puertos

```bash
fscan -h 10.10.10.0/24 -p 22,80,443,445,3389,8080 -o internalPorts
```

> Barrido rápido sobre puertos clave en toda la red interna. Ideal para identificar superficies de ataque tras pivotar.

### Internal Network con Output Detallado

```bash
fscan -h 10.10.10.0/24 -p 1-1024 -o internalFull
```

> Escanea el rango de puertos privilegiados en toda la subred. Buena relación velocidad/cobertura en redes internas.

---

## MASSCAN

### Full Port Scan Ultra Rápido

```bash
sudo masscan -p1-65535 $IP --rate=10000 -oG masscanAll
```

> Escanea todos los puertos TCP a 10.000 paquetes/seg. El más rápido disponible, úsalo para descubrir puertos abiertos y luego profundiza con nmap.

### Top Ports Rápido

```bash
sudo masscan -p1-1000 $IP --rate=5000 -oG masscanTop
```

> Cubre los primeros 1000 puertos con alta velocidad. Equilibrio entre rapidez y cobertura.

### Subred Completa

```bash
sudo masscan -p22,80,443,445,3389,8080,8443 10.10.10.0/24 --rate=5000 -oG masscanNetwork
```

> Escanea puertos clave en toda una red. Perfecto para reconocimiento masivo en redes internas tras pivoting.

### Con Interfaz Específica

```bash
sudo masscan -p1-65535 $IP --rate=10000 -e tun0 -oG masscanVPN
```

> Fuerza el tráfico por la interfaz `tun0` (VPN/HTB). Necesario cuando la ruta por defecto no pasa por el túnel correcto.

### Output XML (Compatible con Nmap)

```bash
sudo masscan -p1-65535 $IP --rate=10000 -oX masscanAll.xml
```

> Guarda resultados en formato XML, compatible para importar en herramientas como Metasploit o procesar con scripts.

---

## Gotchas & Edge Cases

> **Gotcha:** Masscan a `--rate` muy alto en redes con switches baratos puede saturar el buffer y perder respuestas. En labs locales bajar a `--rate=1000` da resultados más fiables.

> **Gotcha:** Nmap con `-A` o `--script vuln` directamente contra un /24 completo es extremadamente lento. Usarlo siempre sobre hosts y puertos ya confirmados.

> **Gotcha:** Fscan en Windows puede ser detectado por Defender casi inmediatamente. Renombrarlo o compilarlo desde fuente ayuda pero no es garantía.

> **VPN trap:** Si estás en HTB/THM sin `-e tun0` en masscan, los paquetes pueden salir por la interfaz equivocada y no llegar al target. Siempre especificar la interfaz en entornos VPN.

> **Firewall trap:** Un host que no responde a ping puede tener puertos abiertos igual. Usar `-Pn` en Nmap para no descartar hosts basándose solo en ICMP.

> **UDP:** Los falsos negativos en UDP son comunes — si un puerto no responde, nmap lo marca como `open|filtered`. Repetir el scan sobre puertos específicos si hay sospecha.

## When To Use This

- Al inicio de cualquier engagement o CTF, fase de reconocimiento
- Cuando tienes una red /16 o mayor — Masscan primero, Nmap después sobre los resultados
- Post-explotación en redes internas donde Fscan es suficiente y más portable
- Para confirmar scope y encontrar hosts que no estaban en el asset inventory

## When NOT To Use This

- Masscan a alta velocidad en redes de producción monitoreadas — va a disparar alertas
- `--script vuln` sin autorización explícita en entornos reales
- Fscan con bruteforce habilitado sin scope claro — muy ruidoso
- En segmentos con IDS/IPS activo sin ajustar timing primero

## Related Techniques

| Technique | When to Use Instead | Tool / Resource |
|-----------|--------------------|----|
| ARP scan | Cuando estás en la misma red L2 | `arp-scan`, `netdiscover` |
| Rustscan | Alternativa rápida para port discovery | `rustscan` |
| Enum4linux-ng | Enumeración específica de SMB/NetBIOS | `enum4linux-ng` |
| Naabu | Port scanning en pipelines automatizados | `naabu` |
| snmpwalk | Enumeración profunda de SNMP tras confirmar UDP 161 | `snmpwalk` |

## Quick Reference Card

```
# NETWORK SCANNING — Quick Reference

## NMAP
[Full scan]        sudo nmap -p- -sS -Pn -n --open --min-rate 6500 -T4 $IP -oG allPorts
[Top 200]          sudo nmap --top-ports 200 -sS -Pn -n --open -T4 $IP -oG topPorts
[Versiones+NSE]    sudo nmap -sCV -p <PORTS> -Pn -n -T4 $IP -oN targeted
[OS detect]        sudo nmap -O -sS -Pn -n -p <PORTS> $IP -oN osDetect
[Vuln scan]        sudo nmap --script vuln -p <PORTS> -Pn -n $IP -oN vulnScan
[UDP críticos]     sudo nmap -sU -p 53,67,161,500 -Pn $IP -oN udpCritical
[SNMP]             sudo nmap -sU -p 161 --script snmp-info,snmp-sysdescr $IP -oN snmpEnum

## FSCAN
[Full port]        fscan -h $IP -p 1-65535 -o allPorts
[Red interna]      fscan -h 10.10.10.0/24 -o networkScan
[Puertos clave]    fscan -h 10.10.10.0/24 -p 22,80,443,445,3389,8080 -o internalPorts

## MASSCAN
[Full rápido]      sudo masscan -p1-65535 $IP --rate=10000 -oG masscanAll
[Red interna]      sudo masscan -p22,80,443,445,3389 10.10.10.0/24 --rate=5000 -oG masscanNet
[VPN/HTB]          sudo masscan -p1-65535 $IP --rate=10000 -e tun0 -oG masscanVPN
[XML output]       sudo masscan -p1-65535 $IP --rate=10000 -oX masscanAll.xml
```

## References

- [Nmap Reference Guide](https://nmap.org/book/man.html)
- [Nmap NSE Scripts](https://nmap.org/nsedoc/)
- [Masscan GitHub](https://github.com/robertdavidgraham/masscan)
- [Fscan GitHub](https://github.com/shadow1ng/fscan)


*Note by zirov · 2026-03-28*