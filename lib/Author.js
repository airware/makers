'use strict';

const argv     = require('yargs').argv,
    extend     = require('jquery-extend'),
    path       = require('path'),
    url        = require('url');


module.exports = class Author {
    constructor (options) {
        const required = [
            'bio',
            'name',
            'job',
            'email'
        ];

        const defaults = {
            url : {
                protocol : 'http',
                hostname : 'localhost',
                port     : argv.p || 3000
            },
            posts   : [],
            classes : [ 'author', 'generated-background' ]
        };

        // Validate options
        required.forEach(prop => {
            if (!options.hasOwnProperty(prop)) {
                throw `Author must have a ${prop} property`;
            }
        });

        // Extend this by the defaults and options
        extend(true, this, defaults, options);

        // Make a slug
        this.slug = path.parse(this.path).name;

        // duplicate the name for page titles
        this.title = this.nickname;

        // Handle environment differences
        switch (process.env.TRAVIS_BRANCH) {
            case 'master':
                this.url.protocol = 'https';
                this.url.host = 'makers.airware.com';
                break;
            case 'develop':
                this.url.protocol = 'https';
                this.url.host = 'makers-staging.airware.com';
                break;
        }

        // Format Link
        this.link = url.format(extend({}, this.url, {
            pathname : `authors/${this.slug}`
        }));

        // Create a path for gulp
        this.path = this.path
            .replace(this.slug, `authors/${this.slug}`)
            .replace('.html', '/index.html'); // Convert to an index file
    }
};
