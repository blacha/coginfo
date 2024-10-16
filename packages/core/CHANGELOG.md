# Changelog

## [9.0.4](https://github.com/blacha/cogeotiff/compare/core-v9.0.3...core-v9.0.4) (2024-10-16)


### Bug Fixes

* **cli:** correctly show "not loaded" when strings are not loaded ([#1309](https://github.com/blacha/cogeotiff/issues/1309)) ([fdbd4e9](https://github.com/blacha/cogeotiff/commit/fdbd4e975ac5f27c4e36438e0f1ff776e7db7f5a))

## [9.0.3](https://github.com/blacha/cogeotiff/compare/core-v9.0.2...core-v9.0.3) (2024-01-08)


### Bug Fixes

* **core:** correctly get image width/height ([3697ade](https://github.com/blacha/cogeotiff/commit/3697aded0267f133bc273f9d80d2fa53485cf2f3))
* **core:** load more projection information ([57dd0a9](https://github.com/blacha/cogeotiff/commit/57dd0a9443231a1f2bb8be1be66e811467840d1a))

## [9.0.2](https://github.com/blacha/cogeotiff/compare/core-v9.0.1...core-v9.0.2) (2023-12-15)


### Bug Fixes

* **core:** do not read past the end of the offset arrays ([8699bc3](https://github.com/blacha/cogeotiff/commit/8699bc332360895cbc26f4a124d3de22eaea48f2))

## [9.0.1](https://github.com/blacha/cogeotiff/compare/core-v9.0.0...core-v9.0.1) (2023-12-13)


### Bug Fixes

* **core:** do not read past the end of a buffer ([c810ada](https://github.com/blacha/cogeotiff/commit/c810adacd9a508858a28d85f75afa620ec94b355))

## [9.0.0](https://github.com/blacha/cogeotiff/compare/core-v8.1.1...core-v9.0.0) (2023-12-11)


### ⚠ BREAKING CHANGES

* rename all type from CogTiff to just Tiff ([#1227](https://github.com/blacha/cogeotiff/issues/1227))
* modify structure of tiff tags ([#1225](https://github.com/blacha/cogeotiff/issues/1225))

### Features

* color more output and add more tags ([fe4088b](https://github.com/blacha/cogeotiff/commit/fe4088b3f1f88a1248d803c29a563872aab4205c))
* export all tag value constants ([#1229](https://github.com/blacha/cogeotiff/issues/1229)) ([44757e5](https://github.com/blacha/cogeotiff/commit/44757e5ba5c98e992bb9fd72eb9993c727648b74))
* expose default read size so it can be easily overridden ([5786246](https://github.com/blacha/cogeotiff/commit/57862469229503c95ee274b555fc75d828b58529))
* expose gdal's NO_DATA as a getter on the image ([#1230](https://github.com/blacha/cogeotiff/issues/1230)) ([fc21a30](https://github.com/blacha/cogeotiff/commit/fc21a30d6754f37923b92ee4fe26c557ff6d9378))
* force some tags to always be arrays ([#1228](https://github.com/blacha/cogeotiff/issues/1228)) ([acc8f93](https://github.com/blacha/cogeotiff/commit/acc8f93eac6f311bdb9d0a6e97e28e2457867c91))
* modify structure of tiff tags ([#1225](https://github.com/blacha/cogeotiff/issues/1225)) ([049e0bc](https://github.com/blacha/cogeotiff/commit/049e0bc3c4e15f8c095a3da4442ef144d372cf60))
* rename all type from CogTiff to just Tiff ([#1227](https://github.com/blacha/cogeotiff/issues/1227)) ([872263b](https://github.com/blacha/cogeotiff/commit/872263b11f1ab06853cb872de54a9d9dd745b647))
* Tag SampleFormat should also be a array ([4216ddd](https://github.com/blacha/cogeotiff/commit/4216dddc1601bf44a1e604ff78e515f90ccdbdfa))


### Bug Fixes

* allow unknown compression types to be read ([9247a70](https://github.com/blacha/cogeotiff/commit/9247a709d6f049785614fa41b79bbadf2061a07e))

## [8.1.1](https://github.com/blacha/cogeotiff/compare/core-v8.1.0...core-v8.1.1) (2023-11-14)


### Bug Fixes

* **core:** correct loading of sub array geotags ([#1214](https://github.com/blacha/cogeotiff/issues/1214)) ([a67ec0a](https://github.com/blacha/cogeotiff/commit/a67ec0a0ca77313fdfb298ea72c532f496562d68))
* **core:** expose CogTiffImage ([aca2c58](https://github.com/blacha/cogeotiff/commit/aca2c58f2c6ad0ccf95310eedd7402d50b9e77bd))

## [8.1.0](https://github.com/blacha/cogeotiff/compare/core-v8.0.2...core-v8.1.0) (2023-08-23)


### Features

* **cli:** fetch all tiff tags with --fetch-tags ([#1155](https://github.com/blacha/cogeotiff/issues/1155)) ([4067751](https://github.com/blacha/cogeotiff/commit/406775184eed18ab10ae2816ecbedea9706b20f5))


### Bug Fixes

* **core:** do not read past the end of a file ([#1152](https://github.com/blacha/cogeotiff/issues/1152)) ([fd0be56](https://github.com/blacha/cogeotiff/commit/fd0be56eee6944239502cd8ffd7a6fe89e76b984))

## [8.0.2](https://github.com/blacha/cogeotiff/compare/core-v8.0.1...core-v8.0.2) (2023-08-05)


### Bug Fixes

* **core:** expose TiffTag and TiffTagGeo ([d538bdc](https://github.com/blacha/cogeotiff/commit/d538bdc833bf76ba8d730a1062156916715585b4))

## [8.0.1](https://github.com/blacha/cogeotiff/compare/core-v8.0.0...core-v8.0.1) (2023-08-05)


### Bug Fixes

* broken changelog ordering ([31f8c8a](https://github.com/blacha/cogeotiff/commit/31f8c8ac5e2770427ed2dc0f5c7c34330c6cb0eb))
