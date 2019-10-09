'use strict';
const fs = require('fs');
const path = require('path');
const find = require('find');
const gulp = require('gulp');
const build = require('@microsoft/sp-build-web');
const pkgDeploy = require('spfx-pkgdeploy').default;
const tsConfig = require('./tsconfig.json');
const WebpackBar = require('webpackbar');
const os = require('os');
const argv = require('yargs').argv;
build.addSuppression(`Warning - [sass] The local CSS class 'ms-Grid' is not camelCase and will not be type-safe.`);
build.addSuppression(`Warning - [sass] The local CSS class '-webkit-filter' is not camelCase and will not be type-safe.`);

try {
    var env = require('./config/env.json');
    pkgDeploy(build, require('./config/package-solution.json'), env);
} catch (error) {
    build.log("Skipping pkgDeploy due to missing config/env.json");
}

gulp.task('versionSync', () => {
    find.file(/\manifest.json$/, path.join(__dirname, "src", "webparts"), (files) => {
        var pkgSolution = require('./config/package-solution.json');
        var newVersionNumber = require('./package.json').version.split('-')[0];
        pkgSolution.solution.version = newVersionNumber + '.0';
        fs.writeFile('./config/package-solution.json', JSON.stringify(pkgSolution, null, 4), (_error) => { /* handle error */ });
        for (let i = 0; i < files.length; i++) {
            let manifest = require(files[i]);
            manifest.version = newVersionNumber;
            fs.writeFile(files[i], JSON.stringify(manifest, null, 4), (_error) => { /* handle error */ });
        }
    });
});

gulp.task('setHiddenToolbox', () => {
    find.file(/\manifest.json$/, path.join(__dirname, "src", "webparts"), (files) => {
        for (let i = 0; i < files.length; i++) {
            let manifest = require(files[i]);
            if (manifest.hiddenFromToolbox != !!argv.ship) {
                manifest.hiddenFromToolbox = !!argv.ship;
                fs.writeFile(files[i], JSON.stringify(manifest, null, 4), (_error) => { /* handle error */ });
            }
        }
    });
});

build.configureWebpack.mergeConfig({
    additionalConfiguration: (generatedConfiguration) => {
        let { paths, outDir } = JSON.parse(JSON.stringify(tsConfig.compilerOptions).replace(/\/\*"/gm, '"'));
        generatedConfiguration.resolve.alias = Object.keys(paths).reduce((alias, key) => {
            let _path = path.join(__dirname, outDir, paths[key][0]);
            return { ...alias, [key]: _path };
        }, generatedConfiguration.resolve.alias);
        generatedConfiguration.plugins = [...(generatedConfiguration.plugins || []), new WebpackBar()];
        if (generatedConfiguration.optimization) {
            generatedConfiguration.optimization.minimizer[0].options.parallel = os.cpus().length - 1;
            generatedConfiguration.optimization.minimizer[0].options.cache = true;
        }
        return generatedConfiguration;
    }
});

build.initialize(gulp);
