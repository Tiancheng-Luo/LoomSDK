/// <reference path="../../../../../typings/d3/d3.d.ts"/>
/// <reference path="../../../../../typings/jquery/jquery.d.ts"/>

//var svgValues = d3.select("body").append("svg")


//var colors = ["#3A3232", "#D83018", "#F07848", "#FDFCCE", "#C0D8D8"];
var colors = ["#611824", "#C12F2A", "#FF6540", "#FEDE7B", "#F7FFEE"];
var invertGraph = true;

var timeInitRange = 20e6;
var tickInitNum = 5;

var tickOffset = 0;
var chartOffset = 0.0;
var tickNum = tickInitNum;
var tickNumF = tickInitNum;

var minTime = 0;
var maxTime = 0;

var innerChartWidth = 0;
var expectedBarWidth = 0;
var chartWidthExtension = 0;
var barXZoomMaxed = false;

var ChartCommon = (function() {
    var t = {};
    
    t.margin = {top: 20, right: 20, bottom: 60, left: 100};
    t.width = 960 - t.margin.left - t.margin.right;
    t.height = 1100 - t.margin.top - t.margin.bottom;
    
    t.timePos = 0;
    t.timeRange = timeInitRange;

    t.padding = 10;
    t.spacing = 0.1;
    t.x = d3.scale.ordinal()
        .rangeRoundBands([t.padding, t.width-t.padding*2], t.spacing);
    
    t.vx = d3.scale.linear()
        .domain([0, tickInitNum])
        .range([0, t.width])
    
    t.y = d3.scale.linear()
        .range([t.height, 0])
    
    if (invertGraph) t.y.domain([t.timePos + t.timeRange, t.timePos]); else t.y.domain([t.timePos, t.timePos + t.timeRange]);

    
    t.chartTransition = function(transition) {
        transition
            .duration(100)
            .ease(d3.ease("cubic-out"))
    }
    
    t.textLine = function(sel, className) {
        return sel.append("tspan")
            .attr("class", className)
            .attr("x", "0")
            .attr("dy", "1.5em")
    }
    
    t.getBoxFitAngle = function(boxWidth, boxHeight, textLength) {
        if (textLength < boxWidth) return 0;
        var angle = Math.acos(Math.min(boxWidth, boxHeight)/textLength)*180/Math.PI;
        if (isNaN(angle)) angle = 90;
        return angle;
    }
    
    t.getTimeFromNano = function(nano) {
        if (nano < 1e3) return nano.toFixed(2)+"ns";
        if (nano < 1e6) return (nano * 1e-3).toFixed(2)+"\u00B5s";
        return (nano * 1e-6).toFixed(2)+"ms";
    }
    
    t.updateDynamicText = function(selection, className, shouldExist, initialTransform) {
        var text = selection.select("."+className);
        var exists = text.size() > 0;
        if (!exists && shouldExist) {
            text = selection.append("text")
                .attr("class", className)
                .attr("transform", initialTransform)
        } else if (exists && !shouldExist) {
            text.remove();
        }
        return text;
    }
    

    
    return t;
}());

var Telemetry = {
    ticks: [],
    stream: null,
    tickBars: null
};
Telemetry.stream = new TStream();
Telemetry.tickBars = new TickBars(ChartCommon);

function TStream() {
    this.pingTime = 20;
    
    this.socket = null;
    this.pinger = null;
    this.messageCallback = null;
    this.init = function() {
        var wsproto = (location.protocol === "https:") ? "wss:" : "ws:";
        this.socket = new WebSocket(wsproto + "//" + window.location.host + "/stream");
        
        this.socket.onopen = function (e) {
            this.showStatus("Stream opened");
            pinger = setInterval(function() { this.ping(); }.bind(this), this.pingTime * 1000);
        }.bind(this);
        
        this.socket.onclose = function (e) {
            this.showStatus("Stream closed "+(e.wasClean ? "cleanly" : "uncleanly")+" with code "+e.code+" and reason: "+e.reason);
            clearInterval(pinger);
        }.bind(this);
        
        this.socket.onmessage = function (e) {
            if (!this.messageCallback) return;
            this.messageCallback(e.data);
        }.bind(this);
        
        this.socket.onerror = function (e) {
            this.showStatus("Stream error");
            this.socket.close();
        }.bind(this);
        
    }
    
    this.showStatus = function(status) {
        console.log(status);
        $("#streamStatus").text(status);
    }
    
    this.ping = function() {
        //if (!this.socket || this.socket.readyState != 1) return;
        this.showStatus("Sent ping at "+Date.now());
        this.socket.send("ping");
    }
}

function TickBars(initCommon) {
    
    var ticks;
    
    this.init = function() {
        if (initCommon) this.updateCommon(initCommon);
        
        ticks = Telemetry.ticks;
            
        addTickLine(30);
        addTickLine(60);
    }
    
    var margin, width, height, x, y, vx, padding, spacing;
    this.updateCommon = function(common) {
        margin = common.margin;
        width = common.width;
        height = common.height;
        x = common.x;
        y = common.y;
        vx = common.vx;
        padding = common.padding;
        spacing = common.spacing;
        
        svgRoot
            .attr("width", width + margin.left + margin.right)
            .attr("height", height + margin.top + margin.bottom)
        
        svgClip
            .attr("width", width)
            .attr("height", height)
            
        svg
            .attr("transform", "translate(" + margin.left + "," + margin.top + ")")
            
        svgAxisX
            .attr("transform", "translate(0," + height + ")")
            
        barXZoom
            .x(vx)
            
        barYZoom
            .y(y)
    }
    
    var axisX = d3.svg.axis()
        .orient("bottom");
    
    var axisY = d3.svg.axis()
        .orient("left")
    
    var svgRoot = d3.select("body").append("svg")
        .attr("class", "tickBars")
    
    var svgClip = svgRoot.append("defs").append("clipPath")
        .attr("id", "clipContents")
        .append("rect")
    
    var svg = svgRoot
        .append("g")
    
    var svgBars = svg.append("g")
        .attr("class", "bars")
        .attr("clip-path", "url(#clipContents)")
    
    var svgBarsBack = svgBars.append("rect")
        .attr("class", "backRect grabbable")
        
    var svgAxisX = svg.append("g")
        .attr("class", "x axis unselectable")
    
    var svgAxisY = svg.append("g")
        .attr("class", "y axis")
    
    var svgAxisXBack = svgAxisX.append("rect")
        .attr("class", "backRect grabbable")
    
    svgAxisX.append("text")
        .attr("x", 0)
        .attr("y", 10)
        .attr("dy", "0em")
        .style("text-anchor", "end")
        .text("Tick #");
        
    svgAxisY.append("text")
        .attr("transform", "rotate(-90)")
        .attr("x", 0)
        .attr("y", 2)
        .attr("dy", "1em")
        .style("text-anchor", "end")
        .text("Tick in nanoseconds");
    
    
    var barXZoom = d3.behavior.zoom()
        .on("zoom", barZoomedX)
    svgAxisXBack.call(barXZoom);
        
    var barYZoom = d3.behavior.zoom()
        .on("zoom", barZoomedY)
    svgBars.call(barYZoom);
    
    
    var tickLines = {};
    function addTickLine(fps) {
        var svgLine = svg.append("g")
            .attr("class", "fps")
            .attr("class", "fps" + fps)
        svgLine.append("line")
            .attr("x1", 0)
            .attr("x2", width)
            .attr("y1", 0)
            .attr("y2", 0)
            .attr("stroke-dasharray", "5,5")
            .attr("clip-path", "url(#clipContents)")
        svgLine.append("text")
            .attr("x", width)
            .attr("y", -5)
            .style("text-anchor", "end")
            .text(
                (1e9/fps).toFixed(2)+"ns | "+
                (1e6/fps).toFixed(2)+"\u00B5s | "+
                (1e3/fps).toFixed(2)+"ms | "+
                (1/fps).toFixed(2)+"s | "+
                fps+"fps"
            );
        tickLines[fps] = { fps: fps, svg: svgLine, time: 0 };
    }
    
    this.handleMessage = function(msg) {
        var m = JSON.parse(msg);
        
        if (m.status != "success") {
            console.log("Result "+m.status+": "+m);
            return;
        }
        
        addTick(m.data);
    }
    
    function addTick(tick) {
        ticks.push({ id: tick.values[0].value, values: tick.values, metrics: tick.ranges, visibleMetrics: null, maxLevel: 0, sectionsVisible: false });
        updateMaxLevel(ticks[ticks.length-1]);
        sortMetrics(ticks[ticks.length-1]);
        
        updateMetricData();
    }
    
    function barZoomXConstrainScale() {
        var minScale = tickInitNum / ticks.length;
        var maxScale = Number.POSITIVE_INFINITY;
        barXZoom.scaleExtent([minScale, maxScale]);
    }
    
    function barZoomXUpdateSize()
    {
        var tickDomain = vx.domain();
        
        innerChartWidth = width - 2 * padding;
        
        tickNumF = tickDomain[1] - tickDomain[0];
        tickNum = Math.ceil(tickNumF - 1e-6);
        
        expectedBarWidth = innerChartWidth/(tickNumF - spacing + 2 * spacing);
        
        chartWidthExtension = expectedBarWidth * (tickNum - tickNumF);
    }
    
    function barZoomXUpdatePosition() {
        var tickDomain = vx.domain();
        
        tickOffset = Math.floor(tickDomain[0]);
        chartOffset = (tickDomain[0] - tickOffset) * expectedBarWidth;
    }
    
    
    function barZoomXConstrainPosition() {
        barZoomXUpdateSize();
        
        var trans = barXZoom.translate();
        var xMax = 0;
        var xMin = -width/(tickNumF)*(ticks.length - tickNumF);
        
        var tx = trans[0];
        var ty = trans[1];
        var touchingBorder = false;
        if (tx > xMax) {
            tx = xMax;
            touchingBorder = true;
        }
        if (tx < xMin) {
            tx = xMin - 1e-6;
            touchingBorder = true;
        }
        
        barXZoom.translate([tx, ty]);
        
        barZoomXUpdatePosition();
    }
    
    function barZoomXAlignBars() {
        var trans = barXZoom.translate();
        console.log("align", trans, chartOffset);
        trans[0] += chartOffset;
        barXZoom.translate(trans);
        
        barZoomXUpdateSize();
        barZoomXUpdatePosition();
        
        console.log("aligned", barXZoom.translate(), chartOffset);
    }
    
    function barZoomedX() {
        barZoomXConstrainPosition();
        
        var tickPad = chartOffset-1e-3 > chartWidthExtension ? 1 : 0;
        tickNum += tickPad;
        
        x.rangeBands([-chartOffset + padding, -chartOffset + innerChartWidth + expectedBarWidth * (tickNum - tickNumF)], spacing);
        updateMetricData();
    }
    
    function barZoomedY() {
        updateMetricData();
    }
    
    function updateMaxLevel(tick) {
        tick.maxLevel = d3.max(tick.metrics, function(metric) { return metric.level; });
    }
    
    function sortMetrics(tick) {
        tick.metrics = tick.metrics.sort(function(a, b) {
            if (a.level < b.level) return -1;
            if (a.level > b.level) return 1;
            if (a.sibling < b.sibling) return -1;
            if (a.sibling > b.sibling) return 1;
            return 0;
        });
    }
    
    function cullMetrics(tick) {
        var lx = x(tick.id);
        var rx = lx + x.rangeBand();
        
        lx = Math.max(padding, lx);
        rx = Math.min(width, rx);
        
        var visibleWidth = rx-lx;
        
        tick.sectionsVisible = visibleWidth > 300;
        if (tick.sectionsVisible) {
            tick.visibleMetrics = tick.metrics.filter(function(metric, index, metrics) {
                if (metric.a > maxTime || metric.b < minTime) return false;
                if (y(metric.b) - y(metric.a) < 1) return false;
                return true;
            })
        } else {
            tick.visibleMetrics = tick.metrics.length > 0 ? [tick.metrics[0]] : [];
        }
        return tick;
    }

    function updateMetricData() {
        
        barZoomXConstrainScale();
        
        ticks = ticks.slice(-60);
        
        if (ticks.length >= 60) Telemetry.stream.socket.close();
        
        var sliceStart = Math.max(0, tickOffset)
        var sliceEnd = Math.min(ticks.length, tickOffset + tickNum)
        var slicedTicks = ticks.slice(sliceStart, sliceEnd)
        
        x.domain(slicedTicks.map(function(tick) {
            return tick.id;
        }));
        
        
        axisX.scale(x);
        axisY.scale(y)
        svgAxisX.call(axisX).selectAll("text")
            .style("text-anchor", "middle")
            .attr("dx", "0em")
            .attr("dy", "0em")
            .attr("transform", function(data) {
                var angle = ChartCommon.getBoxFitAngle(x.rangeBand(), margin.bottom, 15 + this.getComputedTextLength());
                var offset = 10*Math.sin(angle*Math.PI/180);
                var tx = offset;
                var ty = offset + 15;
                return "translate("+tx+" "+ty+") rotate("+angle+")";
            })
        ;
        svgAxisY.call(axisY);
        
        svgAxisXBack
            .attr("width", width)
            .attr("height", margin.bottom)
            
        svgBarsBack
            .attr("width", innerChartWidth)
            .attr("height", height)
        
        updateTickLines();
        
        var durationRange = [0, tickLines[60].time];
        var durationPoints = d3.scale.ordinal().domain(d3.range(colors.length)).rangePoints(durationRange).range();
        var colorFromDuration = d3.scale.linear().domain(durationPoints).range(colors);
        
        minTime = invertGraph ? y.domain()[1] : y.domain()[0];
        maxTime = invertGraph ? y.domain()[0] : y.domain()[1];
        
        
        var prunedSlicedTicks = slicedTicks.map(cullMetrics);
        
        var bars = svgBars.selectAll(".bar").data(prunedSlicedTicks, function(tick) {
            return ""+tick.id;
        })
        
        // Tick bars, new only, group inside of a bar
        bars.enter().append("g")
            .attr("class", "bar grabbable")
        
        bars.exit().remove()
        
        // Tick bars, all
        bars
            .attr("transform", function(tick, index) { return "translate(" +x(tick.id)+", 0)"; })
        
        // Tick bar sections, new
        var barSecAll = bars.selectAll(".bs")
            .data(function(tick) {
                return tick.visibleMetrics;
            }, function(tick) {
                return ""+tick.id;
            })
        
        // Tick bar sections, new only
        var barSecNew = barSecAll.enter()
        var barSecNewGroup = barSecNew.append("g")
            .attr("class", function(metric) { return "bs bs-"+metric.name; })
        
        var barSecRemoved = barSecAll.exit()
        barSecRemoved.remove()
        
        barSecNewGroup.append("rect")
        
        bars.each(function(tick) {
            
            var metrics = tick.metrics;
            var maxLevel = tick.maxLevel;
            
            var fillLevels = false;
            var secX = d3.scale.linear().range([0, x.rangeBand()]).domain([0, maxLevel + (fillLevels ? 0 : 1)]);
            
            var barMaxY = Number.NEGATIVE_INFINITY;
            var barTotalDuration = 0;
            
            var bar = d3.select(this);
            var barInfo = bar.select(".barInfo")
            var barInfoExists = barInfo.size() > 0;
            var barInfoShouldExist = x.rangeBand() > 50;
            
            if (!barInfoExists && barInfoShouldExist) {
                barInfo = bar.append("text")
                    .attr("class", "barInfo")
                    
                barInfo.call(ChartCommon.textLine, "nanoTime")
                barInfo.call(ChartCommon.textLine, "msTime")
            }
            if (barInfoExists && !barInfoShouldExist) barInfo.remove();
            
            bar.selectAll(".bs").each(function(metric, index) {
                
                var parent = metric.parent == -1 ? null : metrics[metric.parent]
                if (parent && metric.sibling == 0) {
                    parent.childNano = 0;
                }
                
                var ay = y(metric.a);
                var by = y(metric.b);
                var dy = by - ay;
                if (!invertGraph) dy = -dy;
                
                if (metric.level == 0) barTotalDuration += metric.b - metric.a;
                
                var sx = secX(metric.level);
                var sy = invertGraph ? ay : by;
                var sw = fillLevels ?
                        secX(maxLevel - metric.level) :
                        metric.parent == -1 ? x.rangeBand() : secX(1);
                var sh = dy;
                
                if (sy+sh > barMaxY) barMaxY = sy+sh;
                
                var barSec = d3.select(this);
                
                barSec.select("rect")
                    .style("fill", function(metric, i) {
                        return colorFromDuration(metric.b - metric.a);
                    })
                    .transition().call(ChartCommon.chartTransition)
                    .attr("x", sx)
                    .attr("y", sy)
                    .attr("width", sw)
                    .attr("height", Math.max(1, sh))
                
                
                var bstX = sx;
                var bstY = sy + sh*0.5;
                
                var textFill;
                
                var bsttX = sx + sw*0.5;
                var bsttY = sy + sh - 5;
                var barSecText = barSec.select(".secName");
                var barSecTextTime = ChartCommon.updateDynamicText(
                    barSec,
                    "secTime",
                    tick.sectionsVisible && sh > 50,
                    "translate("+bsttX+" "+(bsttY+20)+")"
                );
                
                
                var barSecTextExists = barSecText.size() > 0;
                var barSecTextShouldExist = tick.sectionsVisible && sh > 15;
                
                if (!barSecTextExists && barSecTextShouldExist) {
                    barSecText = barSec.append("text")
                        .attr("class", "secName")
                        .attr("transform", "translate(" + bstX + " " + bstY + ") rotate(0)")
                }
                
                if (barSecTextExists && !barSecTextShouldExist) {
                    barSecText.remove();
                }
                
                
                
                if (barSecTextTime.size() > 0 || barSecTextShouldExist) {
                    var rectLab = d3.lab(barSec.select("rect").style("fill"))
                    textFill = rectLab.l > 80 ? "darkgray" : rectLab.brighter(3);
                }
                
                if (barSecTextTime.size() > 0) {
                    barSecTextTime.text(function(metric) {
                        return ChartCommon.getTimeFromNano(metric.b-metric.a);
                    });
                    barSecTextTime.transition().call(ChartCommon.chartTransition)
                        .attr("text-anchor", "middle")
                        .attr("transform", "translate(" + bsttX + " " + bsttY + ")")
                        .style("fill", textFill)
                }
                
                
                if (barSecTextShouldExist) {
                    
                    
                    barSecText.text(function(metric) {
                        return metric.name;
                    });
                    
                    var barSecTextNode = barSecText.node();
                    
                    var textLen = barSecTextNode ? barSecTextNode.getComputedTextLength() : 0;
                    
                    var textVert = textLen > sw-(bstX-sx)*2 && textLen < sh;
                    
                    var bstOOBSpaceCheck = 10;
                    var bstOOBSpacePosition = 10;
                    
                    if (textVert) bstOOBSpaceCheck += textLen*0.5;
                    
                    var bstOOB =
                        bstY > y.range()[0] - bstOOBSpaceCheck ? 0 :
                        bstY < y.range()[1] + bstOOBSpaceCheck ? 1 : -1;
                    
                    if (bstOOB != -1) {
                        bstY = y.range()[bstOOB] + bstOOBSpacePosition * (bstOOB == 0 ? -1 : 1);
                        textVert = false;
                    }
                    
                    bstX += textVert ? -3+sw*0.5 : 5;
                    
                    var vertAngle = Math.acos(Math.min(sw, sh)/(textLen+40))*180/Math.PI;
                    if (isNaN(vertAngle)) vertAngle = 90;
                    
                    barSecText.transition().call(ChartCommon.chartTransition)
                        .attr("height", sh)
                        .attr("dy", (textVert ? 0 : 3))
                        .attr("text-anchor", textVert ? "middle" : "start")
                        .attr("transform", "translate(" + bstX + " " + bstY + ") rotate("+(textVert ? vertAngle : 0)+")")
                        .style("fill", textFill)
                        
                        
                }
                
                if (parent) parent.childNano += metric.a;
                
            });
            
            if (barInfoShouldExist) {
                var barInfoLen = 0;
                barInfoLen = Math.max(barInfoLen, barInfo.select(".nanoTime").text(barTotalDuration.toFixed(3) + " ns").node().getComputedTextLength())
                barInfoLen = Math.max(barInfoLen, barInfo.select(".msTime").text((barTotalDuration * 1e-6).toFixed(3) + " ms").node().getComputedTextLength())
                
                var barInfoHeight = barInfo.node().clientHeight;
                var barInfoAngle = ChartCommon.getBoxFitAngle(x.rangeBand(), 100, barInfoLen + 40);
                
                barInfo.transition().call(ChartCommon.chartTransition)
                    .attr("width", x.rangeBand())
                    .attr("height", barInfoHeight)
                    .attr("text-anchor", "start")
                    .attr("transform", "translate("+Math.sin(barInfoAngle*Math.PI/180)*barInfoHeight+" "+(barMaxY)+") rotate("+barInfoAngle+") ")
            }
            
        })
        
    }
    
    function updateTickLines() {
        for (var fps in tickLines) {
            var tickLine = tickLines[fps];
            tickLine.time = 1e9/tickLine.fps;
            var height = y(tickLine.time);
            tickLine.svg.attr("transform", "translate(0, " + height + ")");
        }
    }
        
    this.init();
}

function initStream() {
    Telemetry.stream.messageCallback = Telemetry.tickBars.handleMessage;
    Telemetry.stream.init();
}




$(document).ready(function () {
    initStream();
});



/*

    svgLine.append("rect")
        .attr("class", "tickLine")
        .attr("x", 0)
        .attr("width", width)
        .attr("height", 1)
        */



/*
var valueHeight = 100;

svgValues
    .attr("class", "tickValues")
    .attr("width", width + margin.left + margin.right)
    .attr("height", valueHeight)
*/