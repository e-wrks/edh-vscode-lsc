# Đ (Edh) Language Server for VSCode

This extension integrates
[Đ (Edh) Language Server](https://github.com/e-wrks/els)
to VSCode (by implementing a
[language server](https://microsoft.github.io/language-server-protocol) client)

## Install

1.  Make sure you have [EPM](https://github.com/e-wrks/epm) installed

2.  Minimum set of packages to install is
    [edh](https://github.com/e-wrks/edh),
    [nedh](https://github.com/e-wrks/nedh) and
    [els](https://github.com/e-wrks/els). They can be installed either:

    - When initializing your
      [epm home](https://github.com/e-wrks/epm#create-a-new-epm-home), e.g.

      ```console
      $ mkdir /my/epm-home
      $ cd /my/epm-home
      $ epm init edh nedh els
      ```

    - Or later e.g.

      ```console
      $ cd /my/epm-home
      $ epm install edh nedh els
      ```

## Build

`cd` to the automatically created `edh-universe` subdirectory of your
[epm home](https://github.com/e-wrks/epm#create-a-new-epm-home)

```console
$ cd /my/epm-home/edh-universe/
```

### with [Stack](https://haskellstack.org)

```console
$ stack install
```

### with [Cabal](https://www.haskell.org/cabal)

```console
$ cabal v2-install --overwrite-policy=always
```
