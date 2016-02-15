

#### Dust Helpers

https://www.npmjs.com/package/common-dustjs-helpers

##### Truncate

Returns the supplied 'data' parameter truncated using the supplied 'length' parameter

###### Usage

```
{@Truncate data="{body}" length="250"/}
```

##### Trim

Returns the supplied 'data' parameter trimmed of whitespace on both left and right sides

###### Usage

```
{@Trim data="{body}"/}
```

##### formatDate

Returns the supplied 'data' parameter formatted using the supplied 'format' parameter. Uses the MomentJS library to format the date parameter.

###### Usage

```
{@formatDate data="{body}" format="YYYY-MM-DDTh:mm:ss+01:00"/}
```

##### markdown

Returns the supplied markdown content formatted as HTML.

###### Usage

```
{@markdown}
{content}
{/markdown}
```

#### More Information

 * See the [DustJS website](http://www.dustjs.com/) for more information regarding Dust template syntax.
